#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$dataexUrl = 'http://127.0.0.1:8766/dataex-chatgpt.html'
$dataexRoot = $PSScriptRoot

function Test-DataExResponse {
    $request = [System.Net.HttpWebRequest]::Create($dataexUrl)
    $request.Proxy = $null
    $request.AllowAutoRedirect = $false
    $request.Timeout = 1200
    $request.ReadWriteTimeout = 1200
    $request.Method = 'GET'
    $response = $null
    try {
        $response = $request.GetResponse()
        return ([int]$response.StatusCode -eq 200)
    } catch {
        return $false
    } finally {
        if ($null -ne $response) { $response.Close() }
    }
}

# A healthy server is left entirely alone, including its process and browser tabs.
if (Test-DataExResponse) {
    [pscustomobject]@{ Status = 'AlreadyRunning'; Url = $dataexUrl }
    return
}

$dataexMutex = [System.Threading.Mutex]::new($false, 'Local\DataEx-dev-server-8766')
$ownsDataexMutex = $false
try {
    try { $ownsDataexMutex = $dataexMutex.WaitOne(5000) }
    catch [System.Threading.AbandonedMutexException] { $ownsDataexMutex = $true }
    if (-not $ownsDataexMutex) { throw 'DataEx startup is already in progress. Retry shortly; port remains 8766.' }
    if (Test-DataExResponse) {
        [pscustomobject]@{ Status = 'AlreadyRunning'; Url = $dataexUrl }
        return
    }
    $occupied = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object { $_.Port -eq 8766 }
    if ($occupied) {
        throw 'Port 8766 is occupied, but the DataEx page is unavailable. No process was stopped and no other port will be used.'
    }
    $dataexEntry = Join-Path $dataexRoot 'dataex-chatgpt.html'
    $dataexServer = Join-Path $dataexRoot 'dataex-dev-server.cjs'
    if (-not (Test-Path -LiteralPath $dataexEntry -PathType Leaf) -or
        -not (Test-Path -LiteralPath $dataexServer -PathType Leaf)) {
        throw 'Run start-dataex.ps1 from the DataEx folder containing dataex-chatgpt.html and dataex-dev-server.cjs.'
    }
    $dataexNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $dataexNode) { throw 'Node.js (node.exe) is required to start the local DataEx server.' }
    $dataexChild = Start-Process -FilePath $dataexNode.Source -ArgumentList @('"' + $dataexServer + '"') `
        -WorkingDirectory $dataexRoot -WindowStyle Hidden -PassThru
    $dataexDeadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        if (Test-DataExResponse) {
            [pscustomobject]@{ Status = 'Started'; Url = $dataexUrl; ProcessId = $dataexChild.Id; Root = $dataexRoot }
            return
        }
        $dataexChild.Refresh()
        if ($dataexChild.HasExited) { throw "DataEx server exited before the page became available (exit $($dataexChild.ExitCode)). Port remains 8766." }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $dataexDeadline)
    throw 'DataEx did not become ready at 127.0.0.1:8766 within 15 seconds. No alternate port was started.'
} finally {
    if ($ownsDataexMutex) { $dataexMutex.ReleaseMutex() }
    $dataexMutex.Dispose()
}
