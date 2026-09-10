# DataEx 表示微調整・Click-to-Source 実測記録

2026-09-09 / dataex-chatgpt-phase1。Outcome-card + matrix + PDFジャンプの構造を維持した表示調整。

## 変更ファイル

- dataex-results-ui.js: 群見出しとOutcome名の短縮表示、正式名称・尺度の副表示、開閉式の警告バッジ。
- dataex-results.css: 群名tooltip、正式名称の小さな副表示、1行の警告バッジ。
- dataex-results.browser.test.cjs: 既存15項目を維持・強化し4項目を追加。数値だけの一致でなく描画領域も測定。折り畳み・zoomの非同期描画完了を待機。
- DATAEX_RESULT_UI_POLISH.md: 本記録。

## 表示

群見出しは Indiv. / Standard / Simulated / Usual care。正式群名は見出しのtooltip、アクセシビリティ名、既存の「4群を表示」の詳細に保持。
Roland disability、Symptom bothersomeness、Roland ≥3-point improvementなどを見出しに使用。正式Outcome名は直下の小さい文字とtooltip、既存詳細・Rawに保持。尺度も副表示に残す。
未登録の長い名称は表示だけを省略し、正式名を保持。短縮群名が重なる場合は元のarm IDを付けて区別する。抽出・Outcome分類・effect対応に短縮名を使わない。
n未確定とBaseline報告差は1行の小さいバッジ。展開すると元の説明を表示。Raw / Trace、Baseline、Change、Adjusted effectの折り畳みを維持。

## Cherkin 2009 の実測

URL: http://127.0.0.1:8766/dataex-chatgpt.html
原著: F:/マイドライブ/2016年works/AI/作成アプリ/GRADEopen/DataExtraction/例３/Cherkin 2009.pdf
既存の独立したChromiumテスト環境で、上記ローカルアプリ・実PDF・固定Rawを使用。保存済みの5画面と375pxの画面を視覚確認した。

| クリック対象 | 実際の移動・黄色表示 | 解決状態 | 矩形数 | 時間 |
|---|---|---|---:|---:|
| 6.3 (5.7) | p.21 Table 2 / Standardized acupuncture × 8 weeksのセル内 | cell | 1 | 102 ms |
| 8.9 (6.0) | p.21 Table 2 / Usual care × 8 weeksのセル内 | cell | 1 | 39 ms |
| Roland Outcome title | p.21 Rolandブロック。Bothersomenessを含めない | section | 60テキスト断片 | 42 ms |
| -2.63 [-3.69, -1.56] | p.22 回転したTable 3の値・脚注印・CI内 | cell | 3 | 52 ms |
| Roland ≥3-point improvement | p.17 Figure 4の画像領域とFigure 4ラベル | figure | 2 | 97 ms |

各セルの描画範囲を、原著の行・列境界内に収まるかで検証した。6.3 / 8.9はいずれもページ面積の約0.04759%だけを黄色表示。調整済み効果は合計約0.12422%。矩形はページ左上原点の0〜1座標と実画面pxで記録。
時間はこのPCでの今回のクリックから位置解決イベントまでの実測値。描画矩形と原文を含む詳細は acceptance/acceptance-A-H.json。
既存の位置解決が指定5か所で正しく動いたため、dataex-source-navigation.jsやPDF処理には変更を加えていない。

## テスト結果

- 既存回帰: 155/155、16スイート全合格。
- 既存表示・Source単体: 20/20。
- Cherkin実PDFブラウザ: 19/19（既存15＋追加4）。A〜Hも維持。
- 合計194/194。既存190項目の検証範囲を維持。
- Cherkinで検索・手動黄色ハイライト・図選択・caption MATCHEDを確認。結果セルへ移動しても元の選択IDと図領域を保持。
- 375pxで表・見出し・バッジを操作可能。n未確定バッジは1行、ページ横あふれなし。
- Raw163件・出典169件を保持。固定RawファイルのSHA-256と表示・JSON保存の内容を照合。JavaScript例外・PDFアップロードなし。

## 保存先

C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Result-UI-polish

- acceptance/acceptance-A-H.json: 全19項目とクリック位置・矩形・所要時間・通信記録
- acceptance/D-cell-Table2.png
- acceptance/D2-usual-care-Table2.png
- acceptance/E-outcome-block.png
- acceptance/F-adjusted-Table3.png
- acceptance/G-Figure4.png
- acceptance/results-375.png
- regression/suite-result.json: 既存155項目
- unit-results.txt: 既存20単体テスト
- baseline-files.json / verification.json: 変更前後の照合

## 保持と制限

新しい抽出ロジック、AI API、PDF自動送信は追加していない。Fuzzy Core、表示分類モデル、PDF検索・選択・caption・Source位置解決は変更なし。mainへのcommit・merge・pushは実施していない。
位置が一意でない場合に行・原文・ページへ戻す既存挙動は維持。今回のセル精度は上記Cherkinの実測対象についての確認。
作業再開後、内蔵ブラウザ操作ツールと通常のファイル読取ツールにWindows sandboxのACL初期化エラーが発生。内蔵ブラウザ上での更新後確認は未完了。既存ローカルChromiumによる実PDF検証と、保存画像の視覚確認は完了した。ユーザーの入力済みタブは再読み込みしていない。

HEAD: 980fec695ad42bad05ed715c73b73571b7c749a3
main: f355b304970fe233c6c001ac2184e8d40a5466f2
