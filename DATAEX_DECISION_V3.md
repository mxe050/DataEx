**DataEx Decision / Finalization v3 実装・受入テスト報告（2026-09-09）**

AI候補を原著で確認し、採用・修正・除外・保留を判断した後、Outcome確定、Study確定、Review Workspaceへの蓄積、CSV出力へ進めるようにしました。添付の DataEx_Confirm_ReviewWorkspace_CSV_Workflow_v3.md に基づく今回の実装です。

実装先は dataex-chatgpt-phase1。開始時からHEADは 980fec695ad42bad05ed715c73b73571b7c749a3、mainは f355b304970fe233c6c001ac2184e8d40a5466f2 のままです。今回のcommit・merge・pushはしていません。開始前からある変更を保持しています。

| 変更ファイル | 内容 |
|---|---|
| dataex-chatgpt.html | Decision関連のJS/CSSを読み込み |
| dataex-fuzzy-workspace.js | 結果表示との接続、保存済み研究の再表示・PDF再接続 |
| dataex-results-ui.js | 既存の値リンク・Outcomeカードに人間の判断操作を追加 |
| dataex-decisions.js（新規） | RawとDecisionの分離、確定状態、履歴、CSV生成 |
| dataex-review-store.js（新規） | IndexedDB永続化、更新競合・保存失敗の処理 |
| dataex-review-workspace.js（新規） | セル編集、Outcome/Study確定、群・時点の判断、Workspace、CSV画面 |
| dataex-review.css（新規） | 既存matrixを維持したコンパクトな操作とモーダル、375px対応 |
| dataex-decisions.test.cjs（新規） | 23件のモデル・CSVテスト |
| dataex-decisions.browser.test.cjs（新規） | Cherkin受入1〜10を含む19件の実ブラウザテスト |
| DATAEX_DECISION_V3.md（新規） | この報告書 |

Outcomeカードを開くと、各値の「⋯」から原著表示・採用・修正・除外・保留を操作できます。カード下の「レビューに採用」で追跡時点をまとめて採用し、「このOutcomeを確定」へ進みます。個別の修正・除外・保留は一括採用でも保持します。Baseline、関連するAdjusted effect等は既存の折りたたみに残し、必要なセルを個別に採用します。

n等が不足する場合は短い確認文と「そのまま確定」「保留」を表示します。研究の確定前には、採用・除外・保留/未確定のOutcomeを要約します。再編集、ロック解除、判断履歴の確認もできます。群・時点は抽出後の折りたたみで既存AI提案を確認し、全群・全時点のRawを保持したまま判断を保存します。

Raw候補はsnapshot.rawと各point.rawに保持し、修正はdecision.finalValueにのみ保存します。原著表示はREVIEWEDまでで、自動採用はしません。判断が変われば該当OutcomeやStudyの確定を解除します。IndexedDBの dataex-review-workspace / studies にproject、研究、Raw、Decision、source metadata、履歴を保存します。PDF本体は保存していないため、再読込後は保存結果を表示しつつ、原著PDFの再選択を案内します。

保存はrevisionを照合するトランザクションです。他タブの更新を上書きせず、保存容量等のエラー時も直前の保存値を保持して画面に知らせます。研究切替時には、別研究の保存結果が現在の表示へ混ざらないようにしています。

CSVはMaster long format（指定32列）、Continuous pairwise、Binary pairwise、Generic inverse variance、Auditの5形式です。通常出力はACCEPTED/EDITEDのみで、既定では確定Study・確定Outcomeに限定します。Auditは全163ポイントのRaw・Final・状態・履歴を含みます。画面プレビューは先頭20行、ファイルは全行です。UTF-8 BOM、引用符・改行のエスケープを使用します。

保留があれば「確定済みだけ出力」の確認を必要とします。pairwiseは1研究につき介入/比較の1組を明示的に選び、共有対照を自動複製しません。未確定のn/SDやevents/total、不一致の解析集団、複数の競合する効果候補等は出力時に知らせます。同じ研究の複数抽出版が確定している場合も、重複出力を停止します。

| テスト群 | 合格 |
|---|---:|
| 既存Phase・Prompt Builder・Fuzzy | 155 / 155 |
| 既存結果モデル・SourceAnchor | 20 / 20 |
| 既存Cherkin結果UI・Click-to-Source | 19 / 19 |
| 新規Decision・CSVモデル | 23 / 23 |
| 新規実ブラウザ | 19 / 19 |
| **合計** | **236 / 236** |

既存114テストを含む155件の回帰は既存の runner を使用しました。過去の設定画面の互換テストは既存どおり dataex-classic.html、Fuzzy/範囲選択/今回の確認は dataex-chatgpt.html で行っています。すべて127.0.0.1:8766を使用しました。

| Cherkin受入テスト | 実測結果 |
|---|---|
| 1 Roland 8週セル→原著 | p.21 Table 2 Standardized × 8 weeks の6.3 (5.7)に黄色表示 |
| 2 Roland採用・Outcome確定 | ACCEPTED。n未記載を明示確認して確定 |
| 3 1セル修正 | Finalのみ変更、EDITED。Raw mean=6.3、n=nullを保持 |
| 4 Cost除外 | Outcome=EXCLUDED、元のOutcome・出典・履歴を保持 |
| 5 Study確定 | IndexedDBにCONFIRMEDで保存、Workspaceに表示 |
| 6 再読込 | 決定・修正値を復元、PDF未接続を案内。同一PDF再接続後もFinalを保持 |
| 7 Master CSV | ACCEPTED/EDITEDのみ、指定32列、保存ファイル全体と生成内容が一致 |
| 8 Continuous CSV | Standardized対Usual careの確定Finalを使用。不足値の組を除外して通知 |
| 9 HOLD | 保留警告と「確定済みだけ出力」を確認 |
| 10 共有対照 | 比較未選択時に警告・出力停止。1比較の明示選択後に出力 |

Costは今回の固定Rawに数値行がないOutcomeです。数値を追加せず、Outcomeと出典メタデータの除外・保持を確認しました。これとは別に数値を持つセルの除外も操作し、監査CSVのEXCLUDED行を確認しています。

追加で、ロックと再編集、同時更新の競合、保存容量エラー、375pxのセル編集、群・時点判断の保存を検証しました。合成Study Bを実際の2つ目のPDFとして読み込み、2研究の蓄積・再読込・個別復帰を確認しました。Binaryのゼロイベント、GIVのEffect/SEも合成Studyで画面プレビューと実ファイル保存を確認しました。

検証用CSVには意図的なダミー修正（例：mean 6.1、n 152/148）が含まれます。臨床的に確認された抽出値ではありません。すべて隔離したブラウザプロファイルで実行し、利用者の既存タブのPDF・フォーム・抽出結果を変更していません。

実装前の60ファイルのハッシュとの比較では、既存ファイルの変更は上記3件だけです。Fuzzy Core本文・Coreモジュール、PDF/検索、範囲・図選択、caption、SourceAnchorモデル、黄色ハイライト、公開用index.htmlは不変です。Cherkin固定RawのSHA-256は 5f34409a2bdc32ea28eb24ac91e2772680b42f5951c1bafbd5acc85a0d11bf05、Raw163件・出典169件を保持しました。PDF検索、テキスト選択、手動ハイライト、図表選択、caption、ズーム、5つの指定Click-to-Sourceも既存テストで合格しています。

検証記録・CSV・画面証跡は次に保存しました。

[総合検証記録](C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/verification.json)

[受入1〜10と追加検証](C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/acceptance/acceptance-1-10.json)

[原著セルの黄色表示](C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/acceptance/01-click-source.png) / [保存した2研究](C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/acceptance/workspace-two-studies.png) / [CSVプレビュー](C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/acceptance/08-continuous-final-preview.png) / [375px編集](C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/acceptance/decision-375.png)

検証CSVの保存場所：
C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Decision-v3/acceptance/

ファイル名：Review Workspace_master.csv、Review Workspace_continuous.csv、Review Workspace_binary.csv、Review Workspace_giv.csv、Review Workspace_audit.csv。5ファイルとも実在し、ダウンロード全体と生成CSVの完全一致、BOM・末尾CRLFを確認しました。

実サーバーは既存の start-dataex.ps1 を実行し、AlreadyRunningを確認しました。URLは http://127.0.0.1:8766/dataex-chatgpt.html です。実ブラウザ検証は隔離したPlaywright Chromiumで行い、保存した画面も目視確認しました。今回、内蔵ブラウザ操作ツールはWindows環境エラー（helper_unknown_error / apply deny-read ACLs）で使用できず、右ペイン表示要求はqueuedのままでした。右ペインで新UIが反映されたことは未確認です。既存タブを自動再読込していません。

保存はこのブラウザ・同一originのIndexedDBに限定されます。ブラウザデータを消去した場合や別ブラウザへ移った場合には自動復元しません。PDFは再接続が必要です。群の自動合算、分母の推定、比の効果のlog変換、SEの補完、RevMan XML、GRADE連携は今回追加していません。AI API接続やPDF自動送信も追加していません。
