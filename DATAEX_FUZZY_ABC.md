# Fuzzy Data Extraction Workspace — Phase A–C

Workspace version **1.0.0** / Core **fuzzy-1.0.0** / data schema **1**。
設計指示: `DATAEX_FUZZY_DESIGN_v1.md`。今回の実装範囲はPhase A〜C。

## 操作

1. `start-dataex.ps1` で既存の127.0.0.1:8766サーバーを確認する。
2. `dataex-chatgpt.html` を開き、PDFを選択する。複数PDFはこのタブのキューから1研究ずつ切り替えられる。
3. Review名、Population、Intervention、Comparator、Outcomesはすべて任意。空欄でも進める。
4. 「このPDFからデータを抽出」で短い依頼文をコピーし、隣のChatGPT/Codexチャットへ送信する。
5. AIはsite toolsから固定CoreとPDFを読み、研究概要・Outcome inventory・原値をDataExに返す。結果表で原値・換算候補・解析候補を確認する。

APIキー・課金型APIクライアント・自動送信はない。ページ内ボタンだけでLLMをバックグラウンド起動するAPIは利用していない。チャットからのAI実行が必要であり、待機中は明示する。WebMCP非対応環境でAIが動いたと装うことはない。
Site tools方式は[OpenAIの公式説明](https://learn.chatgpt.com/docs/webmcp)に従う。

## Phase A：事前入力の削減

新画面にStudy Design、Data Type、Requested Statistics、Analysis Population / Denominator、Scale、Time Origin、Time Selection Rule、Timepoint、Synthesis Node Rule、Extra Rulesの入力欄はない。Advancedに隠してもいない。旧Profileを新しい任意PICOへ自動適用しない。
旧画面とCore v0.9は `dataex-classic.html` と既存ファイルに保持している。既存設定の消去・移行はしない。新画面から詳細な事前ルールへ誘導しない。

## Phase B：Fuzzy CoreとAI経路

- `dataex-fuzzy-core.js`: 固定Core、任意PICOの収集、Discovery/Targeted Fuzzy切替、結果schema、Raw検証、出典検査、候補計算。
- `prompts/DataEx_Fuzzy_CORE_PROMPT_v1.txt`: 同一内容のCore原本控え。単体テストでJS定数との全文一致を確認。
- `dataex-fuzzy-workspace.js`: brief → document map/page text → set_resultsのsite tools、依頼状態・PDF ID・requestId、結果描画とローカル保存。
- Outcomeの発見・意味対応・研究デザインの判断はChatGPT/Codexが固定Coreに沿って行う。ローカルのキーワード検索だけをAI抽出とは呼ばない。候補は新しい概念名も受け取れる。
- 未入力で抽出を停止しない。データ形式の不正・別PDF・期限切れ依頼は受け付けない。出典未照合・数値不足でも候補自体は表示する。
- 0–10から0–100へのpain-intensity換算、対応する観測SEと解析nからのSD候補はローカル計算。前提と数式を保存し、Rawは変更しない。調整済み・special designのSEは単純換算しない。
- 群統合・時点・Outcome対応は提案として保持する。全arm・全timepointを消さない。

## Phase C：結果と保存構造

研究概要 → Outcome inventory → Raw（continuous/binary/effect/count）→ Normalized candidates → Analysis-ready candidates → 提案・要確認事項。
Needs reviewはまず3件を表示し、それ以外は展開して確認できる。確認カードの採否操作はPhase D。

```text
StudyRecord {
  schemaVersion, id, pdf,
  raw: { requestId, pdfId, study, sources, outcomes, rawValues, proposals, limitations },
  normalizedCandidates,
  analysisReadyCandidates,
  sourceChecks,
  sourceTraceIndex,
  reviewDecisions: []
}
ReviewWorkspace (今後の構造) {
  schemaVersion, reviewContext, studyIds: [], mappingDecisions: []
}
```

各統計量にsourceRefsを持つ。SourceにはPDF file/page、printed page、section、Table/Figure、row、column、directValue、evidenceText、kind、selectionIdを保持する。文字列照合は意味的正しさの保証ではない。確信度はAIの自己評価であり正答率ではない。Sourceボタンは既存の根拠フォーカス・黄色ハイライトへ接続する。

localStorageは `dataex:fuzzy:v1:context` と `dataex:fuzzy:v1:study:<pdfId>:<requestId>`、`:latest`。旧Core/Profile/結果のキーを変更しない。Rawの異なる再提出を同じrequestIdで上書きしない。別の抽出依頼は別キーに保存する。PDF再選択時にテキスト出典を再照合する。PDF本体はメモリのみ。Core、生成Prompt、APIキーはlocalStorageへ保存しない。既存の視覚抽出結果も独立して保存・復元する。

## 既存機能とテスト

PDFレンダー・検索・focus・zoomの実装を再利用し、`dataex-selection.js`、`dataex-caption.js` は変更しない。`dataex-visual.js` はFuzzy画面だけでOutcome/群名の完全一致を要求しないオプションを追加し、旧画面の既定動作・画像/caption処理・概算値の判定は維持する。WebMCPの登録数は引き続き10。新ページの抽出briefと結果schemaはFuzzy用。旧schemaはclassicページに維持する。

`DATAEX_INCLUDE_BUILDER=1`、`DATAEX_INCLUDE_FUZZY=1`、`DATAEX_URL=http://127.0.0.1:8766/dataex-chatgpt.html` を設定して `node dataex-regression.test.cjs`。
従来のテストファイル・assertionは削除しない。旧設定/Profile/Prompt Builderの契約はclassicページ、Phase 3.1のPDF操作と新規統合テストは新ページに対して実行し、各実行URLを結果JSONへ保存する。
実行環境変数は既存どおり `DATAEX_PLAYWRIGHT_MODULE` / `DATAEX_PDFLIB_MODULE` / `DATAEX_PDF_DIR` / `DATAEX_ARTIFACT_DIR`。

新テストは合成PDFと構造化AI応答fixtureによる機能検証。AIの医学論文抽出精度を自動テストのPASS数と同一視しない。

## 今回の範囲外

- Phase D: 確認カードと抽出後の採用・修正操作。
- Phase E: レビュー単位の研究蓄積、対応ルール学習、横断Matrix。PDFの一時キューや個別結果保存とは別。
- Phase F: RevMan用CSV/TSVなどの出力。
- 元設計の受入Test 6（2研究目の対応学習）、Test 7（CSV）はE/Fで実施する。今回のA〜C完了とは混同しない。
- 90% CI→SEなど未対応の自動変換は元のCIを保持する。paired/clusterの高度な効果量計算は候補に要確認を付ける。
- AI API接続・PDF自動送信・自動eligibility screeningは実装しない。
