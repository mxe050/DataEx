# DataEx 作業開始・再開／2つの確認順 統合報告

版: WORK-SESSION-1.0 / OUTCOME-WORKFLOW-1.1（2026-09-20）

## 実装

- 上部に新規／再開、PDF追加／再接続、任意CSV準備、設定だけのクリア、保存版再表示、作業名変更。
- 作業名と保存状態、保存済み研究・表・確認モード・研究／候補位置を復元。旧データを消去しない。
- 空の採用領域をPDF開始時にも準備。論文別の明示選択採用と表への所属を同一transactionで保存。
- アウトカム別の確認と同じ候補・固定承認・所属を使用。論文別は全体長形式、アウトカム別は選択表を下部からCSV／出典CSV／数値TSV出力。
- 共通列定義から二値・連続値・GIV・長形式の空テンプレート／架空4研究の記入例を生成。全8ファイルをアプリから保存して読み戻した。
- UTF-8 CSVを検査・プレビューし全件まとめて保存。元CSV・hash・行番号・元表記を保持。外部の承認記載は内部承認にしない。
- IndexedDBをv2へ拡張し、既存studiesに加えworkflowCatalogsを保持。既存研究行を無条件に書き換えて移行しない。
- 同名別PDFの拒否、再接続中のレビュー世代照合、論文別停止／再開表示、表から明示除外した行の全体出力への反映を修正。

## 変更ファイル

アプリ: dataex-chatgpt.html、dataex-focus-review.js、dataex-fuzzy-workspace.js、dataex-outcome-workflow-ui.js、dataex-outcome-workflow.js、dataex-review-projects.js、dataex-review-store.js、dataex-review-workspace.js。
追加: dataex-work-session.js、dataex-work-session-ui.js、dataex-work-session.css。
説明: README.md、本報告、DataEx_操作手順書_WORK-SESSION-1.0.pdf。
テスト・退避・出力は作業場 work/unified-workflow-20260920 に保存。

## 実測テスト

今回実行した対象既存回帰: **633/633**。21 root scriptsの420チェックと追加9組の213チェック。過去の873等の合格数を流用していない。
新しい契約・CSV検査: **28/28**。
ブラウザの実IndexedDB異常系: **19/19**（transaction abort後の全行rollback、旧版、出力直前の値・出典・固定承認・保存状態・所属の不整合、外部承認偽装など）。
実編集UIハーネス: **5/5**（未保存取消・破棄、保存API失敗時の停止、保存後は未採用、PDF未接続拒否、Rawと他研究不変）。
合計は **685チェック**。操作画面の観察・CSV再読込は別の証跡として保存。
初期ハーネスでは待機先／無変更保存経路の選び方に誤りがあり、訂正後の最終結果のみを上記件数に計上した。

|対象|今回確認した範囲|
|---|---|
|新規・再開|採用8件の架空作業から空作業Bへ切替、元作業へ復帰。作業・モード・研究位置を保存。候補位置は保存APIも検査。|
|PDF|空作業へB/Cを一括選択、Paper-onlyで待機キュー表示。保存済み原著の改名同一PDF再接続。同名別内容は拒否。|
|遅延・停止|既存の識別子／review世代ガードと回帰テスト。実UIのネットワーク遅延タイミング全組合せは未実施。|
|テンプレート|空4種は0行、架空4種は4行。全8種を実保存・再読込。長形式記入例を専用作業へ保存し全件未確認。|
|2モード|架空A/B/C/Dの疼痛＋AEを論文別で8件採用。アウトカム別でも4AE行を共用。|
|修正・除外|架空Dの3.3→3.31でCSV停止。3.3へ戻し出典を確認して再採用。表から除外と取消を実UIで確認。追加の保存失敗試験は架空Dのみを再確認待ちにして終了。|
|出力|架空4AE行16数値、全体8行、Schwartzman 1行4数値。解析CSVと出典CSVの値／ID／承認版／研究順、数値隣の備考、TSVを再読込照合。|
|狭い表示|左ペイン約356pxで長い群名、操作入口、採用、下部CSV操作の折返しを確認。ブラウザ全体375px指定はIABに反映されず未確認。|
|コピー・保存取消|既存33件＋30件の出力ダイアログ試験で拒否fallback／取消／直前変更を検査。OS保存ダイアログ全ブラウザ実機試験は未実施。|

## 原著の実例と対象外

Schwartzman 2009の保存済みRawを隔離コピー。日本語「有害事象・安全性」から症状複合アウトカムを開き、原著PDF p.6 §3.6の **4/9 vs 2/10** と数値クリックの黄色位置を照合。検証用採用後、DataEx自身からCSV・出典CSV・TSVを実保存した。
実際のPDF: F:/マイドライブ/2016年works/AI/作成アプリ/GRADEopen/DataExtraction/例題のコクラン/full_text/ここ/schwartzman2009.pdf。
SHA256: 67036604c8025f9761b876deca0608c763f4a94ac7bbac853de5a5235a3e407a。9ページ。
Lumanauw 2019、Niesters 2013はRaw／保存snapshotの一致確認まで。同一症状複合の定義・対応期間分母を確定していないため同じAE表に混ぜていない。実原著は1研究の通し確認に縮小。架空4研究を実原著4研究成功とは数えていない。
VITAL 2019は保全対象のみ。新規抽出・再抽出・上書きなし。

## 実出力と証跡

exports/ にアプリがダウンロードした実ファイルをコピーして保管。外部スクリプトは再読込照合にのみ使用。
- 架空4研究: DataEx_2b9fe98f-54c0-44cf-9fd7-88526b4ca460_analysis.csv / with_sources.csv / numbers.tsv。
- 架空全体8行: 同prefixの analysis (1).csv / with_sources (1).csv。これらは最初の保存時のファイル名。現在版の全体ファイル名はALL_OUTCOMES。
- 実原著1研究: DataEx_c0c0a3c6-4b7e-4ef7-b288-811a68fed0bf_analysis.csv / with_sources.csv / numbers.tsv。
- DataEx_binary / continuous / giv / long の EMPTY_TEMPLATE と FICTIONAL_DEMO 各CSV。
- evidence/ のログ・download-verification.json・real-readback.json・UI画像。
全ての自動採用は「自動操作検証（研究者の承認ではない）」として隔離環境に限定。

## 保全

本番DB: dataex-review-workspace、dataex-review-projects、dataex-fuzzy-snapshot-cache。
隔離DB: dataex-unified-studies-20260920、dataex-unified-projects-20260920、dataex-unified-cache-20260920。検証localStorage: dataex:unified-20260920:。URLの違いだけには依存していない。
反映直前まで、本番workspace payload hash 85661aaddace176cbe3ab69f4eb6ef9de3f38b8fc0933e701d5a9f220e81476f、本番projects payload hash 4ac3f94a65cac95249c7d7e8ec5e15fc21535761a3374e090455165041a1d0b9 は退避時と一致。既存53設定キーに変更なし。追加は隔離用1キーのみ。
Core、Prompt、decisions、confirmation、csv-trace、effect-type、arm-ontology、paper-model、results-modelはバイト一致。共通preflightExport／数値型／計算式／比較方向は変更していない。
元PDF・元JSONは読み取りのみ。Raw・既存Source Trace・元Workspaceの採用履歴は変更対象外。

## 起動・戻し方

PowerShell: & 'F:\マイドライブ\2016年works\AI\作成アプリ\データ抽出について\start-dataex.ps1'
URL: http://127.0.0.1:8766/dataex-chatgpt.html
branch: dataex-chatgpt-phase1 / 開始HEAD 1be605713ec7236ab0d01b5340fea6da45a88315。
今回のcommit/push/deploy/Git reset/cleanなし。最終ファイルSHA256は release-manifest.json。

退避は before/app、beforeのgzip DB/設定、after、Git差分。元の多数の差分を保持。
UIを戻す場合は rollback-ui.ps1 を使用する。現在ファイルが納品時hashと異なれば停止する。DB v2互換のdataex-review-store.jsとdataex-outcome-workflow.jsは残し、DBを消去・ダウングレードしない。新規追加した非参照資産と全データは削除しない。
新しい作業カタログも保持され、今回版を戻せば再び利用できる。復旧用gzipを本番DBへ無条件上書きしない。

## 制限

外部CSVは未確認候補として保存・閲覧する入口。原著PDF識別子・数値別根拠が足りないCSVを安全な採用へ自動昇格する機能はない。旧承認を復元したい場合は元Workspaceを使う。
CSV新規作業を作成後に取り込み保存が失敗すると、空の作業名が残る場合がある。研究／候補／所属の部分登録はない。
GIVは明示された対応効果型・尺度のみ。未変換HRの自動log化、SE→SD推測はしない。
PDFはブラウザ再起動後に再接続が必要。自動チャット送信・新API・課金・新規抽出なし。
全Rawの独立精度保証、実RevManへの貼付、375pxの端末全体、全論文の原著再照合は未実施。

## 本体への反映後の確認

14ファイルを変更前SHA256の一致確認後に反映し、127.0.0.1:8766の実配信14資産をSHA256照合した。97個の保護対象ファイルは不変。右側内蔵ブラウザで開始・再開ボタンと既存2作業を確認した。

更新後のDBを再退避して、studiesの2レコード全体（Raw・出典・修正・採用履歴を含む）が変更前と完全一致した。DB v2には空のworkflowCatalogsが追加されたのみ。projectsの差分は起動時のupdatedAt 1件のみ。既存53設定キーは完全一致し、追加2キーは隔離検証用。evidence/preservation-after-install.jsonに照合結果を保存した。

rollback-ui.ps1はドライランを実行し、戻す7資産の現在hashと退避hashを確認した。実際の巻き戻し・DB復元は行っていない。

成果物の絶対パス: C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/work/unified-workflow-20260920
