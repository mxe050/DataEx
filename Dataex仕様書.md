# DataEx 再現プロンプト仕様書

このドキュメントは **Claude Opus 4.7（claude.ai のチャット版）** に貼り付けて、メタ分析データ抽出アプリ「DataEx」と同等のものを再現させるための仕様書です。

## 使い方

1. このファイル全体をコピー
2. Claude.ai の新しいチャットに貼り付け
3. 末尾に「上記仕様書に従って、単一HTMLファイルとして実装してください」と添えて送信
4. Artifact として完成HTMLが生成される

> **重要**: 単一の `.html` ファイルで完結すること。ビルド不要、CDNのみ使用、サーバー不要。

---

## 1. アプリ概要

**目的**: RCT（ランダム化比較試験）論文PDFから、システマティックレビュー／メタ分析に必要な数値データを **Google AI Studio の無料APIキー1つ** で自動抽出する、ブラウザ単体で動作するツール。

**ユーザー**: 医学研究者・大学院生。Cochrane Handbook 準拠のメタ分析を行う。

**コアバリュー**:
- 完全無料で動く（Gemma 3 27B = 14,400 req/日）
- 1論文 = 1〜2 APIコール（無料枠を浪費しない）
- 抽出後に PDF と並べて検証可能（クリックで該当箇所をハイライト）
- 図・表・KMカーブも範囲選択で再抽出可能

---

## 2. 技術スタック

```
- 単一 HTML ファイル（ビルド不要）
- React 18 (UMD via cdnjs)
- Babel Standalone (in-browser JSX transform)
- Tailwind CSS (CDN)
- PDF.js 3.11.174 (CDN, with worker)
- Google Generative Language API (v1beta)
- LocalStorage（APIキー任意保存）
```

CDN 例:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';</script>
```

`<script type="text/babel">` 内に React コンポーネントを書く。

---

## 3. アーキテクチャ

```
┌─────────────┐
│  SetupPage  │  APIキー入力 + モデル選択 + 使い方ガイド
└──────┬──────┘
       │ apiKeys[], model
       ▼
┌─────────────────────────────┐
│       ExtractorPage         │
│                             │
│ 左ペイン:                   │
│   - PICO/Outcome 入力       │
│   - PDFアップロード         │
│   - 抽出実行ボタン          │
│   - StageIndicator          │
│   - 結果表示 (OutcomeCards) │
│                             │
│ 右ペイン:                   │
│   - PdfViewer (textLayer +  │
│     canvas + 範囲選択)      │
│   - 検索窓                  │
└─────────────────────────────┘
```

---

## 4. モデル定義（GEMINI_MODELS）

```js
const GEMINI_MODELS = [
  {
    id: "gemma-3-27b-it",
    name: "Gemma 3 27B (推奨/14,400/日)",
    thinking: false,
    supportsSchema: false,  // responseSchema 非対応
    textOnly: false,         // 画像対応（Gemma 3 は vision サポート）
    rpm: 30, rpd: 14400, tpm: 15000, maxOut: 8192,
    tag: "推奨",
    note: "無料枠が圧倒的(14,400/日)。画像対応・出力8K"
  },
  {
    id: "gemma-3-12b-it",
    name: "Gemma 3 12B (軽量・大量処理)",
    thinking: false, supportsSchema: false, textOnly: false,
    rpm: 30, rpd: 14400, tpm: 15000, maxOut: 8192,
    tag: "高速", note: "やや軽量・画像対応・出力8K"
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite (図表/JSON厳密)",
    thinking: false, supportsSchema: true, textOnly: false,
    rpm: 10, rpd: 20, tpm: 250000, maxOut: 64000,
    tag: "JSON厳密", note: "JSON Schema厳守。無料は20/日のみ・出力64K"
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash (高品質/限定)",
    thinking: true, supportsSchema: true, textOnly: false,
    rpm: 5, rpd: 20, tpm: 250000, maxOut: 65536,
    tag: "高品質", note: "高品質だが無料20/日かつRPM 5で詰まりやすい"
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro (要・有料設定)",
    thinking: true, supportsSchema: true, textOnly: false,
    rpm: 5, rpd: 0, tpm: 250000, maxOut: 65536,
    tag: "有料", paid: true, note: "無料枠なし。Billing有効化で利用可"
  }
];
```

**デフォルト**: `gemma-3-27b-it`

**フォールバックチェーン**（503/429 時の自動切替先）:
```js
const FALLBACK_CHAIN = {
  "gemma-3-27b-it":        ["gemma-3-12b-it", "gemini-2.5-flash-lite"],
  "gemma-3-12b-it":        ["gemma-3-27b-it", "gemini-2.5-flash-lite"],
  "gemini-2.5-flash-lite": ["gemini-2.5-flash", "gemma-3-27b-it"],
  "gemini-2.5-flash":      ["gemini-2.5-flash-lite", "gemma-3-27b-it"],
  "gemini-2.5-pro":        ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemma-3-27b-it"]
};
```

---

## 5. APIコール層の重要仕様

### 5-1. エンドポイント
```
POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}
```

### 5-2. リクエストボディ（モデル別の注意）

```js
// 共通
{
  contents: [{ role: "user", parts: [...] }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: modelInfo.maxOut,        // モデルごと（Gemma=8192, Flash Lite=64000等）
    responseMimeType: "application/json",     // 常に JSON
    responseSchema: schema,                    // ★ supportsSchema: true のモデルのみ
    thinkingConfig: { thinkingBudget: 8000 } // ★ thinking: true のモデルのみ
  },
  systemInstruction: { parts: [{ text: systemPrompt }] }  // ★ Gemma は不可！
}
```

### 5-3. Gemma 固有の対応（重要）

Gemma 3 は `systemInstruction` フィールドを **拒否（400 エラー）** する。`responseSchema` も非対応。

```js
const isGemma = /^gemma/i.test(modelId);
const effectiveUserText = isGemma
  ? `${systemPrompt}\n\n---\n\n【ユーザー指示】\n${userText}`  // システムプロンプトをユーザーメッセージに統合
  : userText;

const requestBody = {
  contents: [{ role: "user", parts: [{ text: effectiveUserText }, ...mediaParts] }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: modelInfo.maxOut,
    responseMimeType: "application/json"
    // schema: Gemma の場合は付けない、それ以外は responseSchema を付ける
  }
  // Gemma の場合は systemInstruction を付けない
};
if (!isGemma) requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
```

### 5-4. 画像/PDF入力

```js
// 画像（base64 JPEG）
parts.push({ inlineData: { data: base64Jpeg, mimeType: "image/jpeg" } });

// PDF（base64） — Gemini 系のみ。Gemma は inlineData の PDF 不可
if (/gemini/.test(modelId)) {
  parts.push({ inlineData: { data: pdfBase64, mimeType: "application/pdf" } });
}
```

### 5-5. リトライ＆フォールバック戦略

```
fetch 1回 → 結果分類:
  - ok           → JSONパースして返す
  - auth (401/403) → 次のキーで再試行（全キー失敗で throw）
  - fatal (400/404 等) → 即 throw
  - overloaded (503) → 同モデルで2回連続なら次モデルへフォールバック
  - ratelimit (429):
      - "per day" / "RPD" / "daily" を検出 → 即フォールバック
      - retry-after > 20秒 → 即フォールバック
      - 短期 → 2回試行で次モデルへ
  - server (5xx) → 指数バックオフでリトライ

待機時間:
  - retry-after ヘッダー or RetryInfo.retryDelay があればそれを尊重（ジッタ追加）
  - なければ指数バックオフ（overloaded=6s基準, ratelimit=8s基準, その他=1.5s）
  - フォールバック余地ある場合は最大8秒に制限（無駄待ち防止）
  - 最大45秒キャップ
```

### 5-6. マルチキー・ローテーション

ユーザーは **複数の API キーを登録可能**（別 Google Cloud プロジェクトのキーで無料枠が実質拡張）。

```js
function makeKeyRotator(keys) {
  const list = keys.filter(k => k && k.trim());
  let idx = 0;
  return {
    size: list.length,
    next() { const k = list[idx % list.length]; idx++; return k; },
    all() { return list.slice(); }
  };
}
```

各リクエストで rotator から次のキーを取得して使う。認証エラー時は次のキーへ自動切替。

### 5-7. メディア有無に応じたフォールバック

`images` または `pdfBase64` を含むコールでは、フォールバックチェーンから `textOnly: true` のモデルを除外（ただし Gemma 3 は `textOnly: false` なので除外されない）。

```js
const hasMedia = (images?.length > 0) || !!pdfBase64;
const modelChain = [model, ...(FALLBACK_CHAIN[model] || [])].filter(mid => {
  if (mid === model) return true;  // 指定モデルは必ず試す
  const info = GEMINI_MODELS.find(x => x.id === mid);
  if (hasMedia && info?.textOnly) return false;
  return true;
});
```

### 5-8. 堅牢な JSON パーサ（重要）

AI 応答が出力上限で切り詰められた場合のため、**スタックベースの復旧パーサ**を実装：

```js
function bestEffortJsonParse(text) {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!s) throw new Error("空の応答");
  try { return JSON.parse(s); } catch (e) {}

  // 全位置で開いた括弧 ('{' or '[') のスタックを記録
  // 閉じた直後がチェックポイント
  const stack = [];
  const checkpoints = [];
  let inStr = false, escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      stack.pop();
      checkpoints.push({ pos: i + 1, openStack: stack.slice() });
    }
  }
  // 新しい順にチェックポイントを試す（閉じ括弧をLIFO順に補完）
  for (let i = checkpoints.length - 1; i >= 0; i--) {
    const cp = checkpoints[i];
    let candidate = s.substring(0, cp.pos).replace(/,\s*$/g, '');
    for (let j = cp.openStack.length - 1; j >= 0; j--) {
      candidate += cp.openStack[j] === '{' ? '}' : ']';
    }
    try { return JSON.parse(candidate); } catch (e) {}
  }
  throw new Error("JSON復旧失敗");
}
```

---

## 6. 抽出パイプライン（2段階）

巨大な単一JSON応答（>100KB）の切り詰めを防ぐため、**2回のAPIコール**に分割：

### Stage 1: PDF準備
```js
const isMultimodal = !modelInfo.textOnly;
const tasks = [extractPdfText(pdfFile)];  // PDF.js でテキスト抽出
if (isMultimodal) {
  tasks.push(getPdfBase64(pdfFile));
  tasks.push(extractPdfImages(pdfFile, onProgress, 3.5));  // 3.5倍解像度で各ページを画像化
}
const [pdfText, pdfBase64, pdfImages] = await Promise.all(tasks);
```

### Stage 2: 核心抽出（必須）
スキーマ: `SLIM_EXTRACT_SCHEMA`（PICO + outcomes + statisticalMethods + unclearItems のみ）

### Stage 3: 補完抽出（失敗してもOK）
スキーマ: `SUPPLEMENT_SCHEMA`（baselineCharacteristics + expertCommentary + consortFlow + paperQualityAssessment）

→ 補完が失敗しても核心データは保持される（耐障害性）。

---

## 7. データスキーマ

### 7-1. extractedOutcomes の各要素（最重要）

```js
{
  // 識別
  requestedOutcomeName: "string",   // ユーザーが指定したアウトカム名 / "未指定"
  actualOutcomeName: "string",       // 論文中の実際の名称
  timePoint: "string",               // "12週" "5年" 等
  variationReason: "string",         // 同一アウトカムの異種が複数あるときの理由
  calculationMethod: "string",       // "論文に直接記載" 等
  variableType: "string",            // "Binary" | "Continuous" | "TimeToEvent"
  populationType: "string",          // "ITT" | "PP" | "mITT" | "Safety"
  populationDescription: "string",

  // 数値（最重要：必ず埋める）
  interventionGroup: { n_total: "string", events_or_mean: "string", sd_or_se: "string" },
  comparisonGroup:   { n_total: "string", events_or_mean: "string", sd_or_se: "string" },
  thirdGroupName: "string",
  thirdGroup: { n_total, events_or_mean, sd_or_se },
  effectEstimate: { measureType: "RR/OR/HR/MD等", value, ci95, pValue },

  // 根拠と出処
  evidenceText: "string",            // 原文をそのまま引用（120-250文字以内）
  evidenceTextJa: "string",          // evidenceText の日本語訳
  figureType: "string",              // "Table"/"BarChart"/"LineChart"/"KaplanMeier"/"ForestPlot"/"Boxplot"/"None"
  sourceLocation: "string",          // "Table 2", "Figure 3 KMカーブ", "本文 p.5 段落2"
  notes: "string",
  pageNumber: "integer",             // PDFページ番号（1始まり）
  confidence: "string",              // "high" | "medium" | "low"
  sdOrSe: "string"                   // SD/SE判定
}
```

### 7-2. SLIM_EXTRACT_SCHEMA（核心抽出用）

```js
{
  type: "object",
  properties: {
    paperPICO: { /* P, I, C, thirdGroup, studyDesign, sampleSize, followUpDuration */ },
    statisticalMethods: { type: "array", items: { type: "string" } },
    extractedOutcomes: { type: "array", items: { /* 上記 */ } },
    unclearItems: { type: "array", items: { type: "string" } }
  },
  required: ["paperPICO", "extractedOutcomes"]
}
```

### 7-3. SUPPLEMENT_SCHEMA（補完抽出用）

```js
{
  type: "object",
  properties: {
    consortFlow: { /* randomized, allocatedIntervention/Comparison/Third, analyzedITT_*, analyzedPP_*, lostToFollowUp_* */ },
    baselineCharacteristics: { type: "array", items: { /* category, variable, dataType, unit, intervention/comparison/third Group */ } },
    expertCommentary: { type: "string" },
    paperQualityAssessment: { type: "string" }
  }
}
```

### 7-4. SINGLE_OUTCOME_SCHEMA（PDF選択範囲からの単発抽出用）

extractedOutcomes の items と同じ構造（単一オブジェクト）。

### 7-5. Gemini Schema 形式変換

Gemini API は型を **大文字** で要求するため、内部スキーマを変換：

```js
function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (s && typeof s === 'object') {
    const r = {};
    for (const k in s) {
      if (k === 'type') r[k] = String(s[k]).toUpperCase();
      else if (k === 'description') continue;  // 簡略化のため除外
      else r[k] = toGeminiSchema(s[k]);
    }
    return r;
  }
  return s;
}
```

---

## 8. システムプロンプト（核心）

### 8-1. SYSTEM_PROMPT_EXTRACT

```
あなたは世界最高水準の医学システマティックレビュー/メタ分析の熟練専門家です。
20年以上の臨床研究経験を持ち、Cochrane Handbookの隅々まで精通しています。

【使命】RCT論文から、メタ分析に必要な数値データを「完全無欠の精度」で抽出する。
evidenceText（根拠文）だけでなく、そこに含まれる全ての数値を必ず構造化フィールドに格納すること。

【🚨 最重要・絶対遵守ルール】
evidenceText に書いた数値は、必ず構造化フィールド（n_total, events_or_mean, sd_or_se, effectEstimate.value 等）にも転記する。
evidenceText だけ書いて数値フィールドが空のレコードは厳禁。

【出力例（1アウトカムの完全な姿）】
{
  "actualOutcomeName": "5年生存率（PCR vs SW）",
  "timePoint": "5年",
  "variableType": "Binary",
  "populationType": "ITT",
  "interventionGroup": { "n_total": "114", "events_or_mean": "91 (80%)", "sd_or_se": "-" },
  "comparisonGroup":   { "n_total": "115", "events_or_mean": "64 (56%)", "sd_or_se": "-" },
  "effectEstimate": { "measureType": "IRR", "value": "0.38", "ci95": "0.23-0.63", "pValue": "0.001" },
  "evidenceText": "Survival analysis showed success rates of 80% in PCR group and 56% in SW group...",
  "evidenceTextJa": "生存解析では PCR群80%、SW群56%の成功率を示した...",
  "sourceLocation": "本文 p.5 段落2 + Table 2",
  "pageNumber": 5,
  "confidence": "high",
  "figureType": "None"
}

【揺らぎの完全保持】
- Abstract と本文に数値の違いがある場合 → 両方を別レコードで保持
- 連続変数の「術前 / 術後 / 変化量」→ 3つ独立アウトカム
- ITT vs PP vs mITT vs Safety → 統合せず独立抽出（populationType に明記）
- 時点が複数（4週・12週・24週）→ 時点ごとに別レコード
- 同一アウトカムが異なるサブグループ → 独立抽出

【厳密ルール】
- 文献番号 [15] は除外
- カンマ/ピリオド/スペースを数値区切りとして誤解釈しない
- SD と SE の厳格区別（"±" の後は通常SD、SEなら notes に "SE記載（SD変換要）"）
- ゼロイベントは "0" として記録（空欄禁止）
- 記載がない項目は "不明"。推測・補間は厳禁
- pageNumber に PDFページ番号（1始まり）を必ず記載
- evidenceText には原文をそのまま引用（改変禁止）
- evidenceTextJa は自然な日本語訳

【図・表からの抽出（マルチモーダル時）】
- Table: 全行・全セルを精読
- Bar/Line chart: Y軸目盛りと棒/点の高さを丁寧に読み取り
- Kaplan-Meier カーブ: 各群の特定時点の生存率、median survival、at-risk数
- Forest plot: 各サブグループの効果量・CI
- 図表からの読み取りは confidence="low/medium" に
- figureType フィールドに種別を記録、notes に "[図表からの目視抽出]" と明記
```

### 8-2. ユーザープロンプト（pipeline 内で動的構築）

```
【PICO設定】
P: {ユーザー入力}
I: {ユーザー入力}
C: {ユーザー入力}

【優先抽出アウトカム】
- {ユーザー指定} or "全自動抽出モード"

【タスク】
{添付の論文PDF（テキスト+高解像度画像） or PDFから抽出されたテキスト}を徹底的に精読し、
上記PICO/アウトカム設定に従って **アウトカム数値データ** を抽出してください。

{図・表抽出指示（マルチモーダル時のみ）}

【🚨 最重要】evidenceText に書いた数値は必ず構造化フィールドにも転記
（例: "PCR group n=114, success 91/114 (80%)" → interventionGroup.n_total="114", events_or_mean="91 (80%)"）

【⚠ 出力サイズ厳守】
- evidenceText: {120 (Gemma) or 250 (Gemini)} 文字以内
- evidenceTextJa: 同じく {120 or 250} 文字以内
- 本コールではアウトカム数値の抽出に集中（baseline/commentary は別コール）

【参照テキスト（OCR済みPDF本文）】
{pdfText.substring(0, isMultimodal ? 40000 : 80000)}
```

---

## 9. UI 仕様

### 9-1. SetupPage

```
┌────────────────────────────────────────┐
│  🌟 Meta-Analysis Data Extractor v3    │
│     Gemini Edition                     │
├────────────────────────────────────────┤
│ 📊 設計説明ボックス                    │
│  - 普段使い: Gemma 3 27B (14,400/日)   │
│  - 図表必要時: Flash Lite (20/日)      │
│  - 1論文 = 1 APIリクエスト             │
│  - 503/429 自動回避                    │
├────────────────────────────────────────┤
│ APIキーカード（複数登録可）            │
│  [入力欄 #1] [削除]                    │
│  [入力欄 #2] [削除]                    │
│  [+ キーを追加]                        │
│  [使用モデル: select]                  │
│  ╳ テキスト専用 / 🖼 図表対応 バッジ   │
│  [全キー接続テスト]                    │
├────────────────────────────────────────┤
│ 使い方ガイド（6セクション）            │
│  ① APIキーとは / ② 取得手順           │
│  ③ 複数キー / ④ 守ること               │
│  ⑤ 上限確認 / ⑥ トラブル対処          │
├────────────────────────────────────────┤
│ ☑ APIキーをブラウザに保存              │
│ [✨ 抽出ツールを開始 →]                │
└────────────────────────────────────────┘
```

### 9-2. ExtractorPage（抽出前）

```
┌─────────────────────┐
│ PICO設定            │
│  P: [入力]          │
│  I: [入力]          │
│  C: [入力]          │
├─────────────────────┤
│ 優先アウトカム      │
│  [+追加]            │
│  #1 [名] [定義]     │
├─────────────────────┤
│ PDF アップロード    │
│  (D&D or click)     │
│  [✨ 抽出実行]       │
├─────────────────────┤
│ StageIndicator      │
│  ⚪ PDF準備         │
│  ⚪ 核心抽出        │
│  ⚪ 補完抽出        │
│  ⚪ 完了            │
└─────────────────────┘
```

### 9-3. ExtractorPage（抽出後・分割ペイン）

```
┌─────────────┬─────────────┐
│ 結果ペイン  │ PDFペイン   │
│  抽出ソース │ ツールバー: │
│  品質サマリ │  📝 文章    │
│  PICO比較   │  🔲 図・表  │
│  CONSORT    │  🔍 検索    │
│  患者背景   │  🔎 ズーム   │
│  Outcome 1  │             │
│   表 + 原文 │ ┌─────────┐ │
│   + 訳文    │ │ Page 1  │ │
│  Outcome 2  │ │ ...     │ │
│  ...        │ │ Page N  │ │
│  AI考察     │ └─────────┘ │
│  論文品質   │             │
│  統計手法   │             │
│  不明点     │             │
└─────────────┴─────────────┘
```

### 9-4. OutcomeCard（最重要コンポーネント）

```
┌──────────────────────────────────────────────┐
│ [自動?] [二値/連続] [ITT] [信高/中/低]       │
│ アウトカム名                                 │
│ 時点: ... 出処: ... PNN  [TSV][CSV][確認][再抽出]│
├──────────────────────────────────────────────┤
│ ⚠ 数値が抽出されていません（全空時）          │
├──────────────────────────────────────────────┤
│  介入群        | 対照群      | 効果推定値    │
│  N|平均|SD/SE  | N|平均|SD/SE| 指標|値|CI|P  │
│ [赤斜線=空セル / 編集可能]                   │
├──────────────────────────────────────────────┤
│ 計算: ... 出処: ... 集団: ...                │
│ 📄 原文: "..." (クリックでPDF検索＆ハイライト)│
│ 🇯🇵 訳: "..."                                │
│ 📊 図表種別バッジ（あれば）                  │
│ ⚠ 注記: ...                                  │
└──────────────────────────────────────────────┘
```

**重要なスタイル**:
- 空セル: `background: repeating-linear-gradient(45deg, #fef2f2, #fef2f2 4px, #fee2e2 4px, #fee2e2 8px)` + 赤ボーダー + placeholder "未抽出"
- 原文ブロック: 黄背景 + 黄左ボーダー
- 訳文ブロック: 青背景 + 青左ボーダー
- どちらもクリックで `onSendToSearch(evidenceText, pageNumber)` を呼ぶ
- 新規追加カード: 紫リング（3秒）+ 永続的に紫左ボーダー

### 9-5. PDFビューア (PdfViewer + PdfPage)

**PdfViewer** が複数の **PdfPage** を縦に並べて表示。

**PdfPage の構造**:
```
<div id="pdf-page-{N}">
  <canvas/>                        // PDF.js が描画
  <div class="textLayer"/>         // PDF.js のテキストオーバーレイ（選択可能）
  <div ref={overlayRef}/>          // 範囲選択用オーバーレイ
  {drawing && <div>選択矩形+ボタン</div>}
  <div>P.{N}</div>                 // ページ番号バッジ
</div>
```

**3つの選択モード**:
1. **テキストモード** (デフォルト): textLayer の pointerEvents=auto, overlay=none
2. **範囲モード**: textLayer の pointerEvents=none, overlay=auto + cursor:crosshair
3. **Shift+ドラッグ**: 一時的に範囲モード扱い（Shift キーを押している間のみ）

**範囲選択フロー**:
1. mousedown → draw 状態に { startX, startY, x, y, w, h, active: true }
2. mousemove → 矩形サイズ更新
3. mouseup → active: false（最低 15x15 px 以上の場合のみ）
4. 確定ボタン押下 → canvas から該当領域を切り出して 2倍解像度で JPEG base64 化 → onAreaSelect コール

**テキスト選択フロー**:
1. `selectionchange` イベントを監視（selectionMode === 'text' のときのみ）
2. 250ms デバウンス
3. 10文字以上で textLayer 内なら、フローティングボタン「✨ 選択箇所を抽出」を表示
4. ボタン押下 → onExtractFromSelection({ type: 'text', text, pageNum })

**重要なCSS**（PDF.js のテキストレイヤー）:
```css
.textLayer{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;line-height:1;opacity:.3}
.textLayer>span{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.textLayer>span::selection{background:rgba(0,100,200,.3)}
.highlight-hook{background-color:rgba(250,204,21,.55)!important;color:transparent!important;
  box-shadow:0 0 0 3px rgba(250,204,21,.55);border-radius:2px;
  animation:pulseHL 1.5s ease-in-out infinite;z-index:10}
```

---

## 10. 主要機能の挙動

### 10-1. 抽出実行
- ボタン押下 → runExtractionPipeline 実行
- 進捗: stage1 (PDF準備) → stage2 (核心抽出) → stage3 (補完抽出) → complete

### 10-2. 数値再抽出（OutcomeCard 単位）
- 「数値再抽出」ボタン → 当該アウトカムを SINGLE_OUTCOME_SCHEMA で再抽出
- 既存値は保持、空欄のみ補完
- フォーカスプロンプト：「{outcomeName} について、空欄のフィールドだけ補完してください」

### 10-3. PDF選択範囲からの抽出
- **テキスト選択** → SINGLE_OUTCOME_SCHEMA でテキスト渡し → 1個の outcome を生成 → 既存リストに追加
- **範囲選択（画像）** → 同上、ただし画像を渡す。Gemma選択中なら自動でFlash Liteに切替（マルチモーダル必要）
- 新規追加カードは紫リング3秒ハイライト + outcome-card-N に scrollIntoView

### 10-4. PDF検索＆ハイライト（既存機能）
- 結果カードの原文/訳文クリック → PDF検索ボックスに送信 + 該当ページへスクロール
- textLayer の span を走査し、空白を正規化して部分一致するものに `.highlight-hook` クラス付与
- 失敗時は検索窓の文字を編集して手動再検索可

### 10-5. データ抽出品質サマリー
- 結果上部に「数値抽出率: XX%」を色分け表示
  - 70%以上: 緑（emerald）
  - 40-69%: 橙（amber）
  - 40%未満: 赤（red, 警告 + 改善策表示）

### 10-6. エクスポート
- 全TSV / 全CSV ボタン
- 個別TSV / 個別CSV ボタン
- ヘッダー定義:
  ```
  OC_HDRS = ["要求アウトカム", "実際のアウトカム", "評価時点", ..., "ページ"]
  BL_HDRS = ["カテゴリ", "変数", "型", ..., "ページ"]
  ```

### 10-7. セッション保存
- JSON ダウンロード（pico, outcomes, result, model, keyCount, timestamp）
- APIキーは含めない

### 10-8. localStorage
- KEY: `meta-extractor-v3-config`
- 保存内容: `{ apiKeys, model, saveKeys }`（saveKeys=false なら apiKeys を空で保存）
- 起動時に loadConfig して SetupPage の初期値に

---

## 11. 使い方ガイド（SetupPage 内に折りたたみ表示）

6セクションをアコーディオン形式で表示。各セクションは目次クリックで該当箇所へスクロール。

```
① APIキーとは？             [灰色]
② 無料APIキー取得手順       [青]
③ 複数キーが作れる理由      [紫]
④ 無料枠で守ること          [赤橙]
⑤ 使用量・上限の確認        [青藍]
⑥ トラブル対処              [橙赤]
```

各セクションの内容:
- **①**: APIキー = 識別子。AIza... 40文字。LocalStorageのみ保存
- **②**: aistudio.google.com/apikey で発行、CC不要
- **③**: GCPプロジェクト単位で枠管理、複数キーは別プロジェクトで作成すれば実質拡張
- **④**: 漏洩注意、Billing非有効なら課金されない
- **⑤**: console.cloud.google.com/apis/dashboard で確認、各モデルのRPM/RPD表
- **⑥**: 5つの症状別対処（503/401/429/JSON失敗/安全フィルタ）

---

## 12. デザイン方針

### 12-1. カラーパレット
- **メイン**: 紫グラデーション (`#7c3aed → #a78bfa`) / ピンクとのグラデーション (`#7c3aed → #ec4899`)
- **アクセント**: 青 (Gemini), 紫 (Gemma/選択), 緑 (成功), 橙 (警告), 赤 (エラー), 黄 (ハイライト)
- **背景**: slate-50, スレートグラデーション

### 12-2. フォント
- 本文: 'Noto Sans JP' (日本語対応)
- コード: 'JetBrains Mono'
- デフォルトサイズ: 11-13px (結果テーブルは 13px デフォルト、調整可)

### 12-3. アニメーション
- fadeInUp (0.4s ease-out) for セクション登場
- shimmer (1.8s) for メインCTAボタン
- pulse for アクティブインジケーター
- highlight pulse (1.5s) for PDF検索ヒット

### 12-4. レスポンシブ
- 1024px 以上: PDF + 結果を横並び
- それ未満: 縦積み

### 12-5. アイコン
インラインSVG コンポーネントで実装:
```jsx
const I = ({children, size=18, className=""}) =>
  <svg xmlns="..." width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>{children}</svg>;
```
必要なアイコン: UploadCloud, FileText, Settings, Plus, Trash2, Copy, AlertCircle, CheckCircle2,
ChevronLeft, Activity, FileSearch, Database, Info, Key, Shield, Eye, EyeOff, ArrowRight, XCircle,
Sparkles, Target, ZoomIn/Out, Save, Search, Type, Zap, Brain, Cpu, Link, Layers, Refresh, ShieldCheck

---

## 13. PDF.js 連携詳細

### 13-1. テキスト抽出
```js
async function extractPdfText(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let t = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const c = await p.getTextContent();
    t += `\n--- Page ${i} ---\n` + c.items.map(x => x.str).join(' ');
  }
  return t;
}
```

### 13-2. 画像抽出（高解像度）
```js
async function extractPdfImages(file, onProgress, scale = 3.5) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`高解像度レンダリング (${i}/${pdf.numPages})`);
    const p = await pdf.getPage(i);
    const vp = p.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    parts.push({ inlineData: { data: c.toDataURL('image/jpeg', 0.95).split(',')[1], mimeType: "image/jpeg" } });
    c.width = 0; c.height = 0;  // メモリ解放
  }
  return parts;
}
```

### 13-3. PDF base64
```js
async function getPdfBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode.apply(null, bytes.slice(i, i + chunk));
  return btoa(binary);
}
```

---

## 14. エクスポート列定義

```js
const OC_HDRS = [
  "要求アウトカム", "実際のアウトカム", "評価時点", "揺らぎ説明", "計算方法",
  "変数型", "対象集団", "集団説明",
  "介入群_N", "介入群_イベント/平均", "介入群_SD/SE",
  "対照群_N", "対照群_イベント/平均", "対照群_SD/SE",
  "第3群名", "第3群_N", "第3群_イベント/平均", "第3群_SD/SE",
  "指標", "推定値", "95%CI", "P値", "SD/SE判定", "信頼度",
  "出処", "根拠原文", "注記", "ページ"
];
const BL_HDRS = [
  "カテゴリ", "変数", "型", "単位",
  "介入_N", "介入_値", "介入_SD", "介入_%", "介入_IQR", "介入_範囲",
  "対照_N", "対照_値", "対照_SD", "対照_%", "対照_IQR", "対照_範囲",
  "第3群_N", "第3群_値", "第3群_SD", "第3群_%", "第3群_IQR", "第3群_範囲",
  "P値", "出処", "ページ"
];
```

---

## 15. 必須の挙動チェックリスト

実装後、以下を確認してください：

- [ ] 単一HTMLファイルで、ダブルクリックで起動できる
- [ ] APIキー1個で抽出可能
- [ ] APIキーが複数登録可能（ラウンドロビン）
- [ ] Gemma選択時に systemInstruction エラーが出ない
- [ ] Gemini Flash 系で responseSchema が機能する
- [ ] 503エラー時に自動でフォールバックモデルへ切替
- [ ] 429（日次クォータ）検出時に即フォールバック（リトライループしない）
- [ ] 認証エラー時に次のキーへ自動切替
- [ ] 1論文 = 1〜2 APIコール
- [ ] 抽出結果に各 outcome の数値が入っている（evidenceText だけでなく構造化フィールド）
- [ ] 各 outcome に evidenceText（原文）+ evidenceTextJa（日本語訳）両方
- [ ] 原文/訳文クリックで PDF が検索 & ハイライトされる
- [ ] PDF範囲モードで矩形ドラッグ → 「この範囲から抽出」 → 新規カード追加
- [ ] PDFテキスト選択 → フローティングボタン → 新規カード追加
- [ ] Shift+ドラッグで一時的範囲選択（モード切替不要）
- [ ] 数値抽出率がカラーバナーで表示
- [ ] 空セルが赤斜線で目立つ
- [ ] LocalStorageに任意でAPIキー保存
- [ ] TSV/CSVエクスポート
- [ ] セッション JSON 保存（APIキー除外）
- [ ] **【精度】アウトカムの5要素（domain / tool / metric / aggregation / timepoint）が各レコードで区別される**
- [ ] **【精度】populationType で ITT / mITT / PP / safety / available case を分離**
- [ ] **【精度】連続量で metric="post_value" / "change_from_baseline" / "ancova_adjusted" を区別**
- [ ] **【精度】SD/SE/CI 変換時に originalValue と conversionFormula を記録**
- [ ] **【精度】HR は hrDirection（intervention_vs_control など）を記録**
- [ ] **【精度】図表抽出時に extractionMethod="estimated_from_graph" + confidence="low/medium"**
- [ ] **【精度】pitfallFlags 配列に該当する落とし穴が記録される**
- [ ] **【精度】authorContactRecommended が条件（SDなし、HR-CIなし等）で立つ**
- [ ] **【精度】多群試験で multiArmHandling、特殊デザインで specialDesign が記録**

---

## 16. 失敗時のフォールバック方針

| エラー種別 | 対処 |
|---|---|
| 503 (overloaded) | 6秒+ジッタで待機、2回連続なら次モデル |
| 429 ratelimit (per-day) | 即時次モデル切替 |
| 429 ratelimit (per-min) | 8秒+ジッタ待機、2回試行で次モデル |
| 401/403 (auth) | 次のキーへ、全キー失敗で throw |
| 400/404 (fatal) | 即 throw |
| JSON parse error | bestEffortJsonParse で復旧、不可なら throw with 部分データ |
| 全モデル失敗 | ヒント付きエラー（複数キー登録 / 翌日まで待機 等） |

---

## 17. 完成後の動作例

1. ユーザーがHTMLを開く → SetupPage表示
2. AIza...キーを貼付、Gemma 3 27B選択、テスト成功
3. 「抽出ツールを開始」 → ExtractorPage
4. PICO入力（例: P=Permanent teeth, I=Selective Caries Removal, C=Stepwise Excavation）
5. 論文PDFをドロップ → 「✨ 抽出実行」
6. 進捗: PDF準備 → 核心抽出 → 補完抽出 → 完了（30秒前後）
7. 結果ペインに 5-15 個の OutcomeCard が並ぶ
8. 数値抽出率 80% (緑バナー)
9. ある outcome の原文をクリック → 右ペインの PDF 該当箇所がハイライト
10. KMカーブが見当たらないので Shift+ドラッグで囲む → 「この範囲から抽出」 → 新カード追加
11. 全TSV をクリップボードにコピー → Excel 等に貼付

---

## 18. Cochrane Handbook 準拠 抽出精度向上ルール（追加仕様）

このセクションは既存仕様（1〜17節）を**上書きせず、補完・拡張**する。実装時は本節のルールを `SYSTEM_PROMPT_EXTRACT`（8-1節）と `extractedOutcomes` スキーマ（7-1節）に統合する。

### 18-1. 抽出の3原則

1. **先にルールを決める**: アウトカム・時点・解析集団の優先順位を事前定義
2. **どこから取ったかを必ず記録**: source / population / metric / time point
3. **無理に同じ表に入れない**: 異質なものは別レコード化、変換は履歴を残す

参照: [Cochrane Handbook Chapter 5](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-05)

### 18-2. アウトカムの5要素（必須区別）

各アウトカムは以下5要素で識別。**1要素でも違えば別レコード**。

| 要素 | 例 |
|---|---|
| outcome domain | 疼痛、最大開口量、感染、再手術 |
| measurement tool | VAS 0–100 mm、NRS 0–10、mm |
| metric | 術後値 / 変化量 / イベント有無 |
| aggregation | mean+SD / events+total / HR+CI |
| time point | 術後24h、1週間、3か月 |

### 18-3. 二値アウトカム

- **イベント数と分母を常にセット**で抽出（分母のみ流用禁止）
- 分母の定義を `populationType` に明記（randomized / ITT / mITT / PP / available case / safety）
- イベントの向き（成功/失敗）を統一
- パーセントから逆算する場合は丸め誤差を notes に記録
- ゼロイベントは `"0"`（空欄禁止）

### 18-4. 連続アウトカム

以下を**絶対に統合しない**（独立レコード化）:

| metric の値 | 意味 |
|---|---|
| `post_value` | 術後値 |
| `change_from_baseline` | 変化量 |
| `between_group_difference` | 群間差 |
| `ancova_adjusted` | ベースライン調整済み差 |

確認項目: スケール範囲（0–10 / 0–100）/ 方向（高=悪 or 良）/ 統計量の種類（mean+SD / mean+SE / median+IQR）/ 群別 or 群間 / 調整有無 / 解析n。

**SMD では術後値と変化量を混合厳禁**（SDの意味が異なるため）。

### 18-5. SD / SE / CI / HR 変換ルール

| 入力 | 変換式 |
|---|---|
| SE → SD | `SD = SE × √n` |
| 群別95%CI → SD | `SD = √n × (Upper − Lower) / 3.92` |
| 群間差95%CI → SE_MD | `SE_MD = (Upper − Lower) / 3.92` |
| HR + 95%CI → log HR/SE | `log HR = ln(HR)`, `SE = (ln(Upper) − ln(Lower)) / 3.92` |
| HR反転 | `HR_rev = 1/HR`, `lower_rev = 1/upper`, `upper_rev = 1/lower` |

**変換した場合は必ず履歴記録**:
- `originalValue`: 変換前の生の値
- `conversionFormula`: 適用した式
- `extractionMethod = "converted"`

**変化量SDが不明の場合**: 相関 r を仮定して推定する場合は `assumedCorrelation`（例: `"r=0.5"`）に記録し、感度分析対象とする。

### 18-6. 解析集団（populationType）の厳格分離

ITT / modified ITT / available case / per-protocol / safety を**統合せず独立レコード**で保持。

| 集団 | 用途 |
|---|---|
| ITT | 主解析候補（割付効果） |
| mITT | 主解析候補 or 感度分析 |
| available case | 欠測影響確認 |
| PP | 感度分析 |
| safety | 有害事象解析 |

異なる集団のイベント数を同一メタ分析に投入すると効果の意味がばらつく。

### 18-7. Time-to-event (HR) 抽出優先順位

1. HR + 95%CI（本文/表/図）
2. log HR + SE
3. Cox係数 + SE
4. log-rank O−E + variance
5. HR + p値
6. KM曲線 + number at risk から推定
7. 著者照会

**HRの向きを必ず確認**: `hrDirection` に `"intervention_vs_control"` / `"control_vs_intervention"` / `"reversed"` を記録。  
参照: [Tierney et al. (2007)](https://pmc.ncbi.nlm.nih.gov/articles/PMC1920534/)

### 18-8. データソース優先順位

1. 本文・表・補足資料の数値
2. trial registry（ClinicalTrials.gov 等）
3. 図中・図注の数値
4. グラフからのデジタイズ（最終手段）
5. 著者照会

グラフ抽出時: `extractionMethod = "estimated_from_graph"`, `confidence = "low"` or `"medium"`, `notes` に「[図表からの目視抽出]」。

### 18-9. 多群試験・特殊デザイン

**多群試験（3群以上）**: 同じ対照群を複数比較で再利用すると二重カウント発生。  
`multiArmHandling`: `"two_arm"` / `"intervention_combined"` / `"control_split"` / `"separate_comparison"` を記録。

**特殊デザイン**（並行群RCTとして扱うと危険）:  
`specialDesign`: `"parallel"` / `"crossover"` / `"cluster"` / `"split_mouth"` / `"matched"`。  
歯科・口腔外科では split-mouth が多いので特に注意。

### 18-10. 複数時点・類似アウトカム

- 同研究の複数時点（24h, 48h, 1w）を同一メタ分析に投入禁止 → unit-of-analysis error
- 事前に階層を定義: `short-term (24-48h)` / `medium-term (1-4w)` / `long-term (≥3mo)`
- 類似アウトカム（pain at rest / on movement / worst / average / on chewing）は**混ぜず独立抽出**

### 18-11. 著者照会トリガー（authorContactRecommended=true）

以下に該当する場合 `authorContactRecommended: true`、`notes` に「[著者照会推奨]」を明記:

- SDがない / SE か SD か不明
- change score SD がない
- 図しかない
- ITT と PP の数字が混在
- outcome definition が不明
- HR はあるが CI がない
- 論文内で数字が矛盾
- trial registry と論文で結果が違う

### 18-12. 落とし穴チェック（pitfallFlags 配列に記録）

| フラグ | 検出条件 |
|---|---|
| `denominator_mismatch` | Baseline n と解析 n が異なる |
| `se_sd_confusion` | SE か SD か不明（脚注に "values are mean ± SE" 等） |
| `post_change_mixed` | 術後値SDと変化量SDを混同 |
| `scale_inconsistent` | VAS 0–10 と 0–100 が混在 |
| `hr_direction_unclear` | HR の向きが不明 |
| `multi_timepoint_in_same` | 同研究の複数時点を同一指標に投入 |
| `control_double_use` | 多群試験で対照群を二重使用 |
| `p_only_estimate` | p<0.05 のみから精密値を推定 |
| `safety_efficacy_denom_mix` | 有害事象の分母を efficacy 集団と取り違え |
| `registry_paper_mismatch` | registry と論文で値が違う |

---

## 19. extractedOutcomes 拡張スキーマ（追加フィールド）

7-1節の各要素に**以下フィールドを追加**（既存フィールドは維持、追加分はすべて任意）:

```js
{
  // === 既存フィールド（変更なし） ===
  // requestedOutcomeName, actualOutcomeName, timePoint, variableType,
  // populationType, interventionGroup, comparisonGroup, effectEstimate,
  // evidenceText, evidenceTextJa, sourceLocation, pageNumber, confidence, ...

  // === Cochrane 5要素（追加） ===
  outcomeDomain: "string",        // "Pain", "Maximum mouth opening" 等
  measurementTool: "string",      // "VAS 0-100 mm", "NRS 0-10" 等
  scaleRange: "string",           // "0-10", "0-100", "mm" 等
  scaleDirection: "string",       // "higher_is_worse" | "higher_is_better"
  metric: "string",               // "post_value" | "change_from_baseline"
                                  // | "between_group_difference" | "ancova_adjusted"
                                  // | "event" | "time_to_event"
  aggregation: "string",          // "mean_sd" | "mean_se" | "median_iqr"
                                  // | "events_total" | "hr_ci"

  // === 抽出プロセス記録（追加） ===
  sourceType: "string",           // "main_text" | "table" | "figure"
                                  // | "supplement" | "registry" | "abstract"
  extractionMethod: "string",     // "direct" | "converted"
                                  // | "estimated_from_graph" | "back_calculated"
  originalValue: "string",        // 変換前の値（例: "SE=0.4, n=25"）
  conversionFormula: "string",    // 例: "SD = SE × √n = 0.4 × √25 = 2.0"
  assumedCorrelation: "string",   // 変化量SD推定時の相関（例: "r=0.5"）

  // === HR専用（追加） ===
  hrDirection: "string",          // "intervention_vs_control"
                                  // | "control_vs_intervention" | "reversed"
  adjustedFor: "string",          // 調整因子のカンマ区切り

  // === 多群・特殊デザイン（追加） ===
  multiArmHandling: "string",     // "two_arm" | "intervention_combined"
                                  // | "control_split" | "separate_comparison"
  specialDesign: "string",        // "parallel" | "crossover" | "cluster"
                                  // | "split_mouth" | "matched"

  // === 品質フラグ（追加） ===
  authorContactRecommended: "boolean",  // 著者照会が必要か
  pitfallFlags: { type: "array", items: { type: "string" } }
                                  // 18-12 のフラグ群
}
```

**SLIM_EXTRACT_SCHEMA への反映**: `extractedOutcomes` の items に上記フィールドを追加。  
**Gemma（responseSchema 非対応）**: スキーマで縛れないため、システムプロンプトで JSON 例を明示。

**エクスポート列（OC_HDRS）への追加**:
```js
const OC_HDRS_EXTENDED = [
  ...OC_HDRS,
  "ドメイン", "測定ツール", "スケール範囲", "スケール方向",
  "metric", "aggregation",
  "ソース種別", "抽出方法", "変換前値", "変換式", "仮定相関",
  "HR向き", "調整因子",
  "多群処理", "特殊デザイン",
  "著者照会推奨", "落とし穴フラグ"
];
```

---

## 20. 拡張システムプロンプト（SYSTEM_PROMPT_EXTRACT 追加ブロック）

8-1節の `SYSTEM_PROMPT_EXTRACT` の**末尾に追加**する。

```
【🔬 Cochrane Handbook 準拠の精密抽出ルール（厳守）】

■ アウトカムの5要素を必ず区別
各アウトカムは「outcome domain / measurement tool / metric / aggregation / time point」
の5要素で識別する。1要素でも違えば別レコード。
例: "VAS 24h 平均痛 mean/SD" と "VAS 24h 最大痛 mean/SD" は別アウトカム
例: "VAS 24h 術後値" と "VAS 24h 変化量" は別アウトカム
例: "VAS 24h ITT" と "VAS 24h PP" は別アウトカム

■ 二値アウトカム = イベント数 + 分母（常にセット）
- 分母を populationType に明記（randomized / ITT / mITT / PP / available case / safety）
- パーセントのみなら分母を確認して逆算（複数候補は notes に記録）
- ゼロイベントは "0"（空欄禁止）
- イベントの向き（成功/失敗）を統一

■ 連続アウトカムは絶対に統合しない
metric を必ず指定:
  "post_value" / "change_from_baseline" / "between_group_difference" / "ancova_adjusted"
aggregation も指定:
  "mean_sd" / "mean_se" / "median_iqr"
SMD では術後値と変化量を混合厳禁。

■ SD / SE / CI / HR 変換時は履歴を残す
変換したら extractionMethod="converted"、originalValue に変換前、conversionFormula に式。
- SE → SD: SD = SE × √n
- 群別95%CI → SD: SD = √n × (Upper − Lower) / 3.92
- 群間差95%CI → SE_MD: SE_MD = (Upper − Lower) / 3.92
- HR + 95%CI → log HR/SE: log HR = ln(HR), SE = (ln(Upper) − ln(Lower)) / 3.92
変化量SDを相関仮定で推定したら assumedCorrelation に "r=0.5" 等を記録。

■ 解析集団は混ぜない
ITT / mITT / PP / available case / safety を populationType で必ず区別。
同一アウトカムでも複数集団があれば独立レコード化。

■ HR は向きを確認
intervention vs control なのか逆か。逆なら反転して hrDirection="reversed"。
HR_rev=1/HR, lower_rev=1/upper, upper_rev=1/lower。
adjustedFor に共変量を記録。

■ ソース優先順位
1. 本文・表・補足の数値 → 2. trial registry → 3. 図注 → 4. グラフデジタイズ
sourceType と sourceLocation を具体的に記録（例: "Table 2 row 3", "Figure 3 KM at 5y"）。
グラフ抽出時は extractionMethod="estimated_from_graph"、confidence="low/medium"、
notes に "[図表からの目視抽出]"。
論文と registry/supplement で値が違えば両方を別レコードで保持。

■ 多群試験・特殊デザイン
- 3群以上は multiArmHandling を記録
  ("intervention_combined" / "control_split" / "separate_comparison")
- crossover / cluster / split_mouth / matched は specialDesign に明記し
  notes に取扱注意

■ 複数時点・類似アウトカム
- 同研究の異なる時点（24h / 48h / 1w）は別レコード
- 類似アウトカム（pain at rest / on movement / worst / average / on chewing）は
  混ぜず独立抽出

■ 著者照会トリガー（authorContactRecommended=true）
- SDなし / SE-SD区別不明 / change score SDなし / 図のみ / ITT-PP混在
- outcome定義不明 / HRあるがCIなし / 論文内矛盾 / registry と異なる
notes に「[著者照会推奨]」を明記。

■ 落とし穴チェック（pitfallFlags 配列に追加）
- "denominator_mismatch": Baseline n と解析 n が違う
- "se_sd_confusion": SE か SD か不明
- "post_change_mixed": 術後値SDと変化量SDを混同
- "scale_inconsistent": スケール変換不明
- "hr_direction_unclear": HR の向き不明
- "multi_timepoint_in_same": 同研究の複数時点を同一指標に
- "control_double_use": 多群で対照群再利用
- "p_only_estimate": p値のみから精密値推定
- "safety_efficacy_denom_mix": 有害事象の分母誤用
- "registry_paper_mismatch": registry と論文で値が違う

【出力例（Cochrane 5要素を含む完全な姿）】
{
  "actualOutcomeName": "術後24時間の安静時VAS痛",
  "outcomeDomain": "Postoperative pain",
  "measurementTool": "VAS 0-100 mm",
  "scaleRange": "0-100",
  "scaleDirection": "higher_is_worse",
  "metric": "post_value",
  "aggregation": "mean_sd",
  "timePoint": "術後24時間",
  "variableType": "Continuous",
  "populationType": "ITT",
  "interventionGroup": { "n_total": "50", "events_or_mean": "25.3", "sd_or_se": "12.1" },
  "comparisonGroup":   { "n_total": "50", "events_or_mean": "38.7", "sd_or_se": "14.5" },
  "effectEstimate": { "measureType": "MD", "value": "-13.4", "ci95": "-18.7 to -8.1", "pValue": "<0.001" },
  "sourceType": "table",
  "sourceLocation": "Table 3 row 2",
  "extractionMethod": "direct",
  "originalValue": "-",
  "conversionFormula": "-",
  "hrDirection": "-",
  "specialDesign": "parallel",
  "multiArmHandling": "two_arm",
  "authorContactRecommended": false,
  "pitfallFlags": [],
  "evidenceText": "At 24 hours postoperatively, mean VAS pain at rest was 25.3 (SD 12.1) in the intervention group versus 38.7 (SD 14.5) in the control group (MD -13.4, 95% CI -18.7 to -8.1, p<0.001).",
  "evidenceTextJa": "術後24時間の安静時VAS痛の平均は介入群25.3 (SD 12.1)、対照群38.7 (SD 14.5)（MD -13.4、95%CI -18.7〜-8.1、p<0.001）。",
  "pageNumber": 6,
  "confidence": "high"
}
```

---

## 補足: 実装サイズの目安

- HTMLファイル: 約 2,500〜3,000 行
- React コンポーネント: 約 10〜15 個
- API/ユーティリティ関数: 約 15〜20 個
- 行数の大半は UI + コメント + Tailwindクラス

---

**実装開始時の指示テンプレート**:

> 上記仕様書に従って、`meta-analysis-extractor.html` という単一ファイルで完全に動作するアプリを実装してください。
>
> - 全機能を含めること（簡略化禁止）
> - 既存のコメント言語（日本語）を維持
> - エラーハンドリングは仕様通り厳密に実装
> - CSS は Tailwind CDN + 必要最小限の `<style>` ブロック
> - 単一の Artifact として出力
> - **18〜20節（Cochrane Handbook 準拠の抽出精度向上ルール）を必ず統合すること**:
>   - 7-1節の `extractedOutcomes` スキーマに 19節の追加フィールドを統合
>   - 8-1節の `SYSTEM_PROMPT_EXTRACT` の末尾に 20節のブロックを追加
>   - エクスポート列（OC_HDRS）に 19節の拡張列を追加
