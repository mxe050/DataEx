# DataEx OUTCOME-WORKFLOW-1.0 — 2026-09-20

## 結果と範囲

現行のPaper-first、カテゴリー、下部CSV、二値の自動選択、保存・コピー導線を引き継ぎ、研究横断のアウトカム別確認と解析用採用表を追加した。抽出の変更ではない。主要操作・出力整合性・保全を対象に643チェックが合格（今回実行した既存572、新規モデル31、出力操作30、実IndexedDB異常系10）。過去の873等の件数は流用していない。

通し操作は架空4研究で完了。原著はアクセスできた3研究を調べ、同一定義に適合したSchwartzman 2009の1研究で原著確認→検証用採用→実CSV/TSVを完了。異なるAEを足して4研究の成功とはしていない。新規抽出0、VITAL再抽出0、実RevManへの貼付は未実施。

すべての採用試験は専用DBの自動操作検証であり、実研究者の承認ではない。実研究の旧承認は書き換えていない。

## 実装

|ファイル|変更|
|---|---|
|dataex-outcome-workflow.js|カテゴリー意味、ReviewOutcome/AnalysisCollection/Mapping/Membership/Session、版と所属参照、全行出力前検査|
|dataex-outcome-workflow-ui.js|表選択、研究一覧、進捗、前後研究、保留/除外/取消、PDF再接続、全採用研究CSV/TSV|
|dataex-outcome-workflow.css|14–16px中心の折返し、研究一覧、下部出力操作|
|dataex-focus-review.js|既存カード・数値クリック・編集を再利用し、研究間採用と同研究内の次候補を区別|
|dataex-result-list.js|保存済み引用・文脈による安全性分類、介入前症状の区別|
|dataex-review-store.js|研究と表所属の同一IndexedDB transaction、既存更新時の所属メタデータ保全|
|dataex-review-workspace.js|既存確認・採用の再利用、同時保存、研究間移動とPDFキャッシュ接続|
|dataex-fuzzy-workspace.js|PDF識別子・SHA-256照合、セッション内再利用、古い表示の抑制|
|dataex-webmcp.js|既存PDF読込callback接続のみ。Core/Prompt/抽出schemaは変更しない|
|dataex-chatgpt.html|新しい表示・所属管理モジュールの読込み|
|README.md / DATAEX_OUTCOME_WORKFLOW.md / docs/DataEx_Outcome_Workflow_Guide.pdf|現行起動方法、操作説明、検証・制限・戻し方|

表は既存studiesストア内のworkflowCatalogとして保存。候補・固定承認ID/版・元数値ID・出典ID・対応理由を参照し、数値を別の正本として増殖させない。元Rawは不変。原著の名前を共通名で上書きしない。別の表に切替しても元の所属は残る。

採用と所属の保存成功後にだけ次研究へ移動。有効な旧承認はそのまま参照する。停止・候補/研究/request不一致・PDF hash不一致・旧版・出典改変・保存失敗は拒否。変更後の数値や出典を承認へ自動追随させない。出力は共通preflightExportと既存analysis/trace経路を呼び、全採用行を直前に再照合する。

同研究・別報告・共有対照は一つの表へ二重追加できない。異なる型・比較方向・既知の単位/解析集団/調整状態は混ぜない。時間窓や定義の対応は原著表記と理由を残して人が判断する。効果の大きさ・有意差による自動選択はしない。

## 実画面と通し結果

`evidence/four-study-overview.png`、`evidence/real-source-screen.png`を収録。録画は作成していない。

|対象|原著/PDF|今回の操作と結果|
|---|---|---|
|架空A/B/C/D|各1ページのTEST ONLY PDF|カテゴリー→同じany AE→A/B/C/Dの原著クリック→検証用採用→4研究表→3種実ファイル出力。再読込後も4採用を保持|
|Schwartzman 2009|9ページ原著、p.6 §3.6|nausea/headache/tiredness/dysphoriaのいずれか。完了者4/9 vs 2/10。左右の値クリックと原文の対応を確認し、1研究の表から出力|
|Lumanauw 2019|8ページ原著へ切替|総AE/個別症状は上記4症状複合と同じ定義ではない。この表は保留。数値を補完せず|
|Niesters 2013|7ページ原著へ切替|個別症状、クロスオーバーの期別等が別条件。この表は保留。レビュー値から埋めない|
|Pickering|原著PDF未確認|未抽出/PDFなしとして研究一覧に残した。旧PDFを表示し続けず、移動だけでは採用しない|
|Schwartzmanの2ページPDF|原著ではないコメント/別資料|9ページ原著と区別。独立研究・原著4本目に数えない|
|VITAL|本番Raw238/Outcome65/Source59|保全確認のみ。今回の抽出/採用/出力対象外|

実論文値は保存済みRawからのUI検証であり、新規AI抽出の成功を示す試験ではない。Schwartzmanの原文は「Six of the 19 subjects ... (4/9 in the ketamine group and 2/10 in the placebo group)」。総AEの同義語として統合していない。

## 実出力（DataExのボタンから生成）

`exports/`の6ファイルと`evidence/export-roundtrip.json`を参照。外部スクリプトで完成CSVを作っていない。Pythonはダウンロード済みファイルの再読込・照合だけを行った。

- 架空4研究: `DataEx_d46be227-42a1-4a9b-99e6-22e6e160b694_{analysis.csv,with_sources.csv,numbers.tsv}`
- 実論文1研究: `DataEx_17e9ba63-ce5a-4bec-8827-20b742674c2d_{analysis.csv,with_sources.csv,numbers.tsv}`

5行20数値を照合。架空数値は5/40対2/39、6/40対3/39、7/40対4/39、8/40対5/39。実論文は4/9対2/10。解析CSVは数値独立列、出典付きCSVは各数値の直後に専用source_note。共通名/原著名/定義/理由/時点/群/集団/元候補ID/承認IDと版を保持。CSV・TSVの研究順は同じ。SHA-256、原文、担当者、採用来歴を確認した。

RevMan向けTSVは数値のみ。研究行を同順で準備する必要があり、研究名を登録する正式インポーターではない。実RevMan貼付と作図教材への実投入は未検証。公式貼付仕様: https://documentation.cochrane.org/revman-kb/copy-and-paste-data-in-analyses-198247600.html

## 回帰・異常系

`run-all.py`、`tests/workflow.test.cjs`、`workflow-output.test.cjs`、`lab/atomic-tests.html`。

- 既存21 unit scripts: 420。既存結果一覧40、source selection8、export consistency29、dialog output33、CSV format8、categories21、provenance13: 計152。合計既存572。
- 新規model31: 同研究別PDF/共有対照、複数時点・定義、出典/値/承認版/保存版不一致、変更→再確認、停止、遅延応答、PDF hash、4研究キュー、原本不変。
- 新規出力操作30: 同じUI関数でanalysis/trace/numericの保存・download・copy、直前改変、ダイアログ中改変、取消、コピー拒否、未保存編集。
- 実ブラウザIndexedDB10: 第2書込失敗とabort時の研究+表両方rollback、再試行、2タブの競合、重複、通常更新のcatalog保持、旧承認不変。
- ブラウザ: 左クリック、右クリック8の対象一致、F2、編集キャンセル、4研究採用/取消/再追加、停止/再開、再読込、Review切替後のPDF再利用、原著PDFなし、出力6実ファイル。これらは643に重複加算していない。

今回の修正保存→再採用の実画面での全工程再実施はしていない。既存回帰の複製データで変更/取消/CSV来歴を確認。実研究の数値はテスト目的で修正していない。全23研究の抽出/広範な再監査は未実施。

## 保全と隔離

作業前コード: `before/app/`。Git差分/状態は`before/`。基準は当時のdirty treeで、HEADは`1be605713ec7236ab0d01b5340fea6da45a88315`、branch `dataex-chatgpt-phase1`。過去版へ巻き戻していない。今回Git commit/push/deployは実施していない。

本番`dataex-review-workspace`と`dataex-review-projects`の退避payloadは前後SHA-256が一致。元44個のlocalStorageキーも一致。追加は専用prefixのみ。検証後Raw/Sourceは元の3研究snapshotとdeep equal。根拠は`evidence/preservation.json`。

検証DB: `dataex-outcomeflow-studies-20260920` / `dataex-outcomeflow-projects-20260920` / `dataex-outcomeflow-cache-20260920`、prefix `dataex:outcomeflow-20260920:`。atomic試験は別名。URLだけの隔離ではない。保存したブラウザ退避は`before/`、検証後は`after/`。

Core、Prompt、数値/派生計算、effect resolver、arm ontology、固定承認、CSV trace共通gate、source navigationはコードhash不変。元PDF/JSONは読取のみ。PDF改名の対応は照合済みの表示aliasに限り、Rawのファイル名は変更していない。

## 起動・導入・戻し方

PowerShell: `& 'F:\マイドライブ\2016年works\AI\作成アプリ\データ抽出について\start-dataex.ps1'`

URL: http://127.0.0.1:8766/dataex-chatgpt.html

`release-manifest.json`に変更前後の全対象hash、`Apply-OutcomeWorkflow.ps1`に照合付き導入、`Rollback-OutcomeWorkflow.ps1`に復元手順。両スクリプトとも既定は照合のみ。`-Apply`を付けた場合に限りファイルを反映/戻す。既存に追加の変更があれば停止し、上書きしない。新規ファイルは削除せず退避する。DB自動巻戻し/保存消去はしない。

## 残る制約

- ブラウザ再起動後のPDFはまとめて再接続が必要。同セッション内のみFileを安全に再利用。ブラウザの権限回避はしない。
- 同研究の保存済み別報告は研究リンクでまとめ、各資料ボタンから正しいPDFへ切替できる。単一候補が複数資料を参照し、古いSource Traceに文書識別子がなくファイル名しかない場合の自動文書切替は未保証。誤PDFへ自動で根拠を移さず、当該資料の再接続/確認が必要。
- 日本語の表示意味は既存conceptCandidateと限定した分類規則を使う。任意の原著名の機械翻訳やLLM分類は導入していない。
- 表の比較/時間窓は原著ごとの対応理由を伴う研究者の判断。型・方向・既知の単位/集団/調整は保守的に検査し、意味の異なる数値を自動変換しない。
- Real 4研究の同一定義の通し出力、実RevMan、全Raw独立精度検証は未実施。これらを合格とは報告しない。
- 内蔵ブラウザでは保存ダイアログ非対応時はdownload要求、コピー拒否時は手動欄へ退避。要求と保存完了を区別。実ファイル6点の存在・再読込は別途確認済み。

導入後確認結果は`evidence/install-verification.json`。今回の成果物はこのフォルダに集約し、古い成果物の削除・整理や無断公開は行っていない。
