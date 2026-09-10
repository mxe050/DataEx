# SR Data Extraction Prompt Builder

DataEx Phase 3.2.2に、レビュー仕様から抽出用プロンプトを作る独立部品を追加する。
Builder versionは **1.0.0**、Core Prompt versionは **0.9**。

## 使い方

Intervention、Comparator、Outcomes（1行1件）、Timepointを入力し、必要な項目をAdvancedで指定する。
「AI抽出用プロンプトを生成」で全文を表示する。PDF未読込・仕様未完成でも生成できる。
全文コピー、TXT保存、設定JSON保存を使用できる。生成後に設定を変えた場合は、コピー・保存時にも最新の入力で再生成する。
PDFの読取・抽出・外部送信はこのボタンから実行しない。

Advancedには研究デザイン、Data Type、Requested Statistics、Analysis Population / Denominator、Scale / Unit、Time Origin、Time Selection Rule、Analysis Unit、Synthesis Node Rule、Extra Rulesを用意する。
研究デザインにケースコントロールは含めない。尺度・集団・解析単位は自由記載できる。Data Typeや時点ルールの既定値は未指定とし、利用者の選択を暗黙に決めない。

## Coreの更新

- 原本: `prompts/SR_Extraction_CORE_PROMPT_v0_9.txt`
- ブラウザ配布用定数: `dataex-core-prompt.js` の `CORE_PROMPT_VERSION` / `CORE_PROMPT_TEMPLATE`
- Builder定数・仕様の組立: `dataex-prompt-builder.js` の `BUILDER_VERSION`
- 原本をレビューして更新後、`node sync-dataex-core-prompt.cjs` で配布用JSを再生成する。次のCore版では原本名と同期スクリプト内の版番号も更新する。

原本は指定されたデスクトップ上のv0.9ファイルをそのまま取り込んでいる。単体テストで配布用定数と原本の全文一致を検査する。
利用者向け編集画面は作らない。プロンプトは一度のプレースホルダー置換で生成し、入力中の `$&` や `{{...}}` を再解釈しない。

## 設定・復帰

`DataExPromptBuilder.configuration()` は次を返す。

```
{ studyDesign, intervention, comparator, outcomes, timepoint, analysisUnit,
  nodeRule, populationRule, dataType, requestedStatistics, scale, timeOrigin,
  timeSelectionRule, extraRules }
```

`outcomes` は `id: O1/O2/...`、`name` とOutcome別設定を持つオブジェクトの配列。
共通設定は各Outcomeへ適用し、将来のOutcome Cardから個別値を渡す場合はその値を優先できる。
今回のtextareaでは共通設定のみ編集する。JSONの直接編集・インポート画面は追加しない。

`dataex:prompt-builder:v1` にはレビュー設定とAdvancedの開閉・レビュー設定由来の入力を識別するUI情報だけを保存する。
生成Prompt・Core・PDF本文・画像・API keyは保存しない。既存のPDF別結果とReview Profileの保存処理は変更しない。
Builderの復帰を先に行い、既存PDF別記録の復帰を優先する。Review Profile由来の値をBuilderから明示入力として復元しない。

## Phase 3.2.2との境界 / Source Trace

PDF表示・検索・テキスト/範囲/図選択・図注取得・黄色ハイライトのコードは変更しない。
site toolsは従来の10個のまま。既存の抽出ガードとFigure概算のCANDIDATE_ONLY判定も変更しない。
変更する既存処理はフォームsubmitの役割だけであり、現在はPrompt生成に接続する。
Coreの出力方針が既存の結果判定を書き換えることはない。

将来のSource Trace取込では `pdfFile`, `pdfPage`（1始まり）, `printedPage`, `section`, `tableFigure`, `row`, `column`, `directValue` を保持する。
既存の `visualSourceBundle.selectionSource`、selectionId、PDF識別情報、normalizedRect、`nearbyMetadataSources` は独立した位置情報として継続利用できる。
ジャンプの拡張は対応PDFを識別してから既存 `dataex_focus_evidence` / 選択範囲の表示へ接続する。
今回、Source Trace取込・ジャンプ・AI実行は追加しない。

## テスト

`DATAEX_URL=http://127.0.0.1:8766/dataex-chatgpt.html` を指定し、起動は `start-dataex.ps1` を使う。
`DATAEX_PLAYWRIGHT_MODULE` / `DATAEX_PDFLIB_MODULE` / `DATAEX_PDF_DIR` / `DATAEX_ARTIFACT_DIR` を環境に応じて指定する。

- `node dataex-prompt-builder.test.cjs` : 原本一致、設定・Outcomeの組立、未指定条件、文字列処理、保存対象の検証。
- `node dataex-prompt-builder.browser.test.cjs` : 実ブラウザで生成、コピーと代替処理、保存、復帰、375px、PDFと図注・ハイライトの保持。
- `DATAEX_INCLUDE_BUILDER=1` を指定して `node dataex-regression.test.cjs` : 現行Phase 3.2.2向けの既存12本と追加2本を連続実行。

Phase 2.8.1テストは、役割が変更された旧「データ抽出」ボタンの4箇所を既存confirmExtractionの呼出しへ変更する。ガードの検証項目・assertionは削除しない。
リポジトリには、7 tools時代や旧Profile仕様を前提とした過去Phaseのスナップショットテストも残る。現行回帰スイートとは区別する。
「既存114件」の元の一覧/実行コマンドは未確認。統合前の現行12本のログは78個のPASS項目であり、114件合格と読み替えない。

## 未実装・次の候補

Outcome Cardによる個別設定、Source Trace取込とPDFへのジャンプが次の候補。
AI API接続、自動PDF送信、結果の自動取込は今回の対象外。
