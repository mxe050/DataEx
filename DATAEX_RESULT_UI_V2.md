# DataEx Result UI / Click-to-Source v2 実装・検証記録

2026-09-09。`dataex-chatgpt-phase1` のローカル作業。設計根拠は利用者指定の `DataEx_Result_UI_ClickToSource_Redesign_v2.md`。
結果の表示と原著への移動を改修した。新しい抽出ルール、Core変更、AI API接続、PDF自動送信は加えていない。

## 1. 変更ファイル

実リポジトリ: `F:\マイドライブ\2016年works\AI\作成アプリ\データ抽出について`

| ファイル | 変更内容 |
|---|---|
| dataex-chatgpt.html | 表示モデル・結果UI・Source navigation・CSSの読込 |
| dataex-fuzzy-workspace.js | 従来の全行表示を新UIへ接続。選択済みPDFの照合・再表示 |
| dataex-webmcp.js | 既存PDF.jsのrender/rangeBoxes/clear/zoomへ任意のSource navigationを接続 |
| dataex-results-model.js（新規） | 表示分類、優先度、effect variant対応、SourceAnchorの導出 |
| dataex-results-ui.js（新規） | Outcomeカード、時点×群の表、折り畳み、Rawの絞り込み・20件ページ表示 |
| dataex-source-navigation.js（新規） | SourceAnchorの位置解決、PDF照合、移動、黄色表示 |
| dataex-results.css（新規） | コンパクトな結果表示、375px対応、1.35秒の強調 |
| dataex-fuzzy.browser.test.cjs | 旧テーブル依存の画面assertionをカード・遅延表示へ更新。19項目の検証範囲を維持 |
| dataex-results.test.cjs（新規） | 表示分類・原値保持・位置解決の20単体テスト |
| dataex-results.browser.test.cjs（新規） | Cherkin実PDFと固定RawによるA〜Hを含む15ブラウザテスト |
| DATAEX_RESULT_UI_V2.md（新規） | 本記録 |

## 2. 分類ロジック

分類は表示用の派生モデルだけで行う。原著のOutcome名、ID、Raw、sourceRefs、Coreの返却schemaは維持する。

- 人数・追跡解析数はdenominator metadata、Baselineのみの項目はbaseline metadataへ配置。
- 通院回数・遵守・完遂理由はstudy conductへ配置。
- 調整済み差とNNTはeffect variantへ配置。尺度・概念の対応が一意なら関連Outcome内へ移し、曖昧なら研究概要のanalysis detailsへ残す。
- Aは利用者の指定に対応するOutcome、主要Outcomeの明示、AbstractのResultsに紐付くOutcome。主要Outcomeの判定は原文の該当節に限定する。
- Bはその他の臨床Outcome。改善者・安全性を先に最大5件表示する。
- Cの医療利用、費用、服薬、日数・欠勤等と残りのBは「その他のOutcome」に格納する。

CherkinではRawの26項目から表示上の臨床Outcome18件、metadata/variant8件へ整理した。数値の削除や再抽出はしていない。

## 3. 画面構成

研究名、4群、解析集団n=638、8/26/52週を短く表示する。割付nと解析集団nは混同しない。
初期表示はRoland disabilityとSymptom bothersomenessの主要2件、改善者2件と安全性3件の副次5件。その他11件は折り畳む。

Outcome名は展開と原著表示、数値とSource chipは該当原著への移動を行う。Rolandは3時点×4群、Mean (SD)で表示し、原著の6.0等の表示精度も保持する。
Baseline、Change、調整済み効果、NNT、Raw / Traceは関連Outcome内で展開できる。通常ケアの未報告AEを0に置き換えず、百分率からevents/totalを逆算しない。

要確認事項は5グループにまとめ、元の各指摘は展開時に確認できる。AI確信度は詳細内のHigh/Medium/Lowだけにする。
全Rawは初期描画せず、Outcome/Time/Arm/Typeで絞り込み、20件ずつ表示する。フィルタ中のRaw JSON保存でも全163件を保存する。

## 4. SourceAnchor

Rawを書き換えず、表示モデル内の各値・効果・Outcomeから生成する。

```json
{
  "pdfId": "44a66c2bebdfd760d09b5378ac2636b4",
  "pdfFile": "Cherkin 2009.pdf",
  "pageIndex": 20,
  "pdfPage": 21,
  "printedPage": "21",
  "sourceType": "table",
  "label": "Table 2",
  "section": "Tables/Figures",
  "row": "ROLAND DISABILITY / Standardized acupuncture",
  "column": "8 weeks — Mean (SD)",
  "valueText": "6.3 (5.7)",
  "sourceText": "Standardized Acupuncture 10.8 (5.6) 6.3 (5.7) 6.7 (5.8) 6.0 (5.8)",
  "selectionId": null,
  "rects": [],
  "resolutionStatus": "unresolved",
  "scope": "value",
  "sourceId": "t2-O1-A2-1"
}
```

selectionIdは既存データにあれば維持する。上例のnullは座標なしでも解決できる例。rectsはページ左上を原点とする0〜1の正規化座標。
pageIndexは0始まり、pdfPageは1始まり。printedPageをPDFの移動番号へ代用しない。

## 5. 位置解決とフォールバック

1. fingerprintとファイル名で現在のPDFを確認。既にこのタブで選択・読込済みの対応PDFだけを再表示できる。
2. 同ページのsourceTextを照合し、Outcomeブロック・行に範囲を限定してvalueTextを照合。大文字見出しと表題の重複、Unicodeのマイナス、95% CIのラベルと数値、脚注の星を扱う。
3. 一意な値を特定できない場合は対応する行・原文を表示。別ブロックの同じ数値を単独で採用しない。
4. 図は対応する現在のselectionId、保存済みvisual resultの選択座標を優先。なければPDF.jsの画像描画領域と近接するFigure labelから図の領域と図注を表示。
5. 図表領域が決まらなければcaption、さらに決まらなければ正しいPDFページまで移動して「位置は未確定」と示す。

解決状態はcell / section / row / text / selection / figure / caption / page。キャッシュはメモリ内だけに置く。
初回1.35秒の黄色強調後も淡い黄色を残し、zoom後は正規化座標から描き直す。旧検索ハイライトと解除操作を共有し、手動の紫色選択範囲を削除しない。

## 6. 実装の入口

- 表示分類とSourceAnchor: `dataex-results-model.js` の `category` / `build` / `sourceAnchor`
- 画面描画: `dataex-results-ui.js` の `render`
- 原文の照合: `dataex-source-navigation.js` の `resolveText`
- PDFページ移動: 同ファイルの `navigateToSource` / `resolveSourceAnchor`
- 既存PDF.jsとの接続: `dataex-webmcp.js` の `sourceNavigation` 生成、`renderPage` / `clearHighlights` / `zoom`
- 選択済みPDFの照合: `dataex-fuzzy-workspace.js` の `ensureSourcePdf`

## 7. Cherkin 2009 受入結果

URL: http://127.0.0.1:8766/dataex-chatgpt.html

対象PDF: `F:\マイドライブ\2016年works\AI\作成アプリ\GRADEopen\DataExtraction\例３\Cherkin 2009.pdf`
再抽出せず、保存済み163 Raw値・169出典を使用。内蔵ブラウザの確認用タブと、独立したChromiumの自動テストで確認した。

| 受入 | 確認結果 |
|---|---|
| A | 合格。主要2件を先頭、初期カード7件。26項目の全列挙なし |
| B | 合格。Follow-up analysis n、調整済みMD、NNTを独立した臨床カードから移動 |
| C | 合格。Rolandの8/26/52週×4群。Baselineは非表示、nの注意はOutcomeに1件 |
| D | 合格。6.3 (5.7) → PDF p.21、Table 2、Standardized・8週のセルを黄色表示 |
| E | 合格。Roland名 → PDF p.21のRolandブロック全体。Bothersomenessを含めない |
| F | 合格。-2.63 [-3.69, -1.56] → PDF p.22の回転したTable 3内の値・CIを黄色表示 |
| G | 合格。Roland改善者 → PDF p.17 Figure 4の図領域と図注を表示 |
| H | 合格。要確認事項5グループ。行ごとの重複警告・確信度%は初期表示しない |

クリックから位置解決までは今回のローカル自動テストで約0.04〜0.11秒。ブラウザ/PDFの状態による差があり、全PDFに対する時間保証ではない。

## 8. 既存機能・Rawの保持

既存のPDF表示、PDF内検索、テキスト選択、手動範囲選択、図表プレビュー、caption取得、黄色ハイライトの回帰検証が合格した。
内蔵ブラウザでもCherkin Figure 4を囲んで選択し、captionStatus=MATCHEDを確認。そのまま結果の6.3 (5.7)からp.21へ移動しても、選択ID・p.17の選択・captionStatusが保持された。

利用者が開いていた元のタブは再読込せず保護し、改修版は確認用タブで準備した。
改修前54ファイルのハッシュと照合し、既存ファイルの変更は上記4ファイルだけだった。
`dataex-fuzzy-core.js`、Fuzzy Core本文、PDF selection/caption/visualモジュール、公開index.html、classicページ、サーバー起動方法は同一。
固定Rawのcanonical表現は204797文字、比較チェック値413e4c21で改修前と一致。自動テストは表示・保存後のRawをdeepEqualで照合した。

## 9. テストと保存先

既存155/155、新規単体20/20、Cherkin実PDFブラウザ15/15、合計190/190。
新規ブラウザ15項目にはA〜Hの8件を含む。

検証成果物:
`C:\Users\yuasa\Documents\Codex\2026-09-06\f-2016-works-ai-x20\outputs\DataEx-Result-UI-v2`

- `final-regression\suite-result.json`: 既存16スイート・155項目
- `acceptance\unit-results.txt`: 新規20単体テスト
- `acceptance\acceptance-A-H.json`: 15ブラウザ項目、位置・描画範囲・時間・通信記録
- `acceptance\D-cell-Table2.png` / `E-outcome-block.png` / `F-adjusted-Table3.png` / `G-Figure4.png`: 実PDFの画面
- `acceptance\results-375.png`: 375pxでの操作・配置
- `Cherkin-2009-raw-fixed.json`: 変更しない検証入力

既存テストは `DATAEX_INCLUDE_BUILDER=1` と `DATAEX_INCLUDE_FUZZY=1` を指定して `node dataex-regression.test.cjs` を実行。
新規単体は `node dataex-results.test.cjs`。
Cherkin受入は `DATAEX_CHERKIN_PDF` と `DATAEX_CHERKIN_RAW` に上記ローカル実ファイルを指定して `node dataex-results.browser.test.cjs` を実行する。
ブラウザテストには既存のPlaywright/PDF.js実行環境を使用し、新しいサーバー方式・ポートを追加していない。

## 10. 制限

- 同じ行で同じ値が繰り返されるなど、列を一意に決められない場合は行・原文・caption・ページへのフォールバックになる。
- 図がベクター描画のみ、画像が複数で対応が曖昧、またはスキャンに検索可能な図注がない場合、保存された選択範囲がなければ図全体の自動特定を保証しない。OCRやAIによる座標推定は追加していない。
- 対応PDFをこのタブで選択していなければ、利用者によるPDF選択が必要。外部URLやファイルシステムを自動探索しない。
- Outcomeとeffect variantの対応は表示上の候補。語彙が曖昧な場合はmetadata内で保持し、Rawは削除しない。
- 今回は表示・ナビゲーションの検証。抽出精度の再検証や数値の修正はしていない。

HEAD: `980fec695ad42bad05ed715c73b73571b7c749a3`。main: `f355b304970fe233c6c001ac2184e8d40a5466f2`。
今回のcommit、mainへのmerge、pushは行っていない。
