# DataEx — Meta-Analysis Data Extractor (dual-MODEL Gemini Edition)

RCT（ランダム化比較試験）論文から、システマティックレビュー／メタ分析に必要な数値データを **2つのGeminiモデルで独立に並列抽出** し、不一致フィールドを自動検出するブラウザ単体ツールです。**Google AI Studio の無料APIキー**を貼り付けるだけで動きます。サーバ・課金カード登録すべて不要。

> **エビデンスベース設計**: Vivekanantha 2026 (KSA 70412) が GPT-5.2 + Gemini 3 Pro の dual-LLM で 384 データ点中 95.1% の少なくとも一方正解率を達成した枠組みを、Gemini内 Flash Lite + Flash で再現しています。

## 主な特徴 (v3.6 Full Optimization Edition)

> **本バージョンの新機能**: Pilot mode (Elicit), PDF→Markdown 変換 (HubMeta), Stage 6 LLM Numeric Audit, Stage 5 後処理 (n% 正規化 + PDF 物理突合), 3-run 安定性検証, Living review diff, 抽出テンプレート保存, コホートフィルタ (Vivekanantha A2), Tag Table view (Nested Knowledge), Critic §6 強化監査

## 主な特徴 (v3.5 dual-MODEL Edition)

### 🔬 dual-MODEL モード — Vivekanantha 2026 dual-LLM 方式
- **同じPDFを2つのGeminiモデルで独立に並列抽出**（モデル間で出力共有なし）
- **9カテゴリ判定**: 各フィールドを「両モデル一致正解 / 部分一致 / 要確認 / 単独抽出」に自動分類 (Vivekanantha [1] Methods)
- **3層バッジ**: 各 outcome カードに `correct / partial / incorrect` を視覚的に表示
- **dual-MODEL 差分テーブル**: 不一致フィールドを横並びで比較、Aモデル/Bモデルの値を逐一対照可能

### ⚠ §6 エラーパターン自動検出 (Vivekanantha 2026 Discussion)
- **分散値欠落** — 中心値だけで SD/IQR/range が無い → メタ解析poolingに致命的
- **Primary/Revision アームスワップ** — Vivekanantha [1] Table 2 で Secondary surgery 68.8% と低accuracyの主因
- **単位欠落** — months/years/mm/g 等の単位がevidenceTextにない
- **SE/SD 混同** — "± SE" 表記なのに sdOrSe="SD" のミス検知
- **分母欠落** — 二値変数で events/total の片方のみ
- **ハルシネーション疑い** — 構造化フィールドに数値あり / evidenceTextに数字なし

### 📋 報告標準準拠 (Laignelot 2026 推奨)
- **CONSORT-AI / STARD-AI 準拠 Methods 自動生成** — 論文Methods欄に貼れるテキストを1クリックで出力
- **完全 Audit Log JSON export** — モデル名・バージョン・トークン数・所要時間・dual-LLM 一致率・§6フラグ集計を全て記録 (Vivekanantha [1 Table 3] 互換)

### 🧪 Pilot mode (Elicit 方式)
- 本実行前に「最初の2-3アウトカムだけ」テスト抽出 → プロンプト/コホートフィルタを調整 → 本実行
- 無料枠とトークンを節約しつつ抽出戦略を最適化

### 📑 PDF→Markdown 変換 (HubMeta 方式)
- pdf.js のテキスト座標から行/見出し/表構造を推定 → Markdown 形式で LLM に送信
- 表構造の保持精度が向上、特に数値の多い Table 1 / outcomes table で有効
- ON/OFF 切替可

### 🔬 Stage 6 LLM Numeric Audit
- Critic 後、フラグ付き outcome のみを LLM が再監査
- 各数値が evidenceText / 論文本文に literally 存在するか検証 → 捏造値を自動削除 or 修正
- ハルシネーション検出の二段構え (Stage 5 物理突合 + Stage 6 LLM監査)

### 🔁 3-run 安定性検証 (Vivekanantha 2026 §5-1 推奨)
- 同じ PDF・同じ設定で3回連続抽出 → 各 outcome の出現率 + 値一致率を算出
- 平均安定性 85% 以上 = 高再現性 / 60% 未満 = 非決定性が顕著 (Laignelot 2026 [2] Discussion)

### 📊 Living review diff
- 直近の抽出結果を localStorage に保存
- 同じPDFを再抽出した時、前回との差分(追加/削除/変更/不変)を可視化
- どの数値フィールドが変わったかを line-through で表示

### 📋 抽出テンプレート保存/読込
- PICO + 優先アウトカム + コホートフィルタを名前付きで保存
- 同種SR (例: ACL revision SR) に再利用可能、最大20件まで localStorage に保存
- Vivekanantha 2026 Appendix Table A1 のような領域別標準スキーマを構築する考え方

### その他
- **単一HTMLファイル**でブラウザ完結。サーバ不要・インストール不要
- **Google AI Studio (Gemini) 無料APIキーのみ**で動作。クレジットカード登録不要
- **3パス精度最大化パイプライン**: 核心抽出 → 補完抽出 → Critic監査
- **決定論的設定**: temperature=0.0 + randomness fixed (Vivekanantha [1] 準拠)
- **503/429 自動回避**: Flash Lite ↔ Flash 自動フォールバック + 複数キー自動ローテーション
- **PDFビュアー統合**で該当箇所を即座にハイライト
- **PDF選択範囲から1アウトカム追加抽出** (図・表・本文選択)
- TSV / CSV / Methods / Audit JSON エクスポート対応

## 使い方

1. このリポジトリから `meta-analysis-extractor v3-opus47.html` をダウンロード（または GitHub Pages 上で開く）
2. ブラウザで開く
3. [Google AI Studio](https://aistudio.google.com/apikey) で無料APIキーを発行（`AIzaSy...` で始まる文字列）
4. アプリの「APIキー」欄に貼り付け、「全キー接続テスト」で確認
5. （任意）**🔬 dual-MODEL モード** を有効化 → モデルA(主) と モデルB(副) を選択
6. PICO を入力、PDFをドラッグ＆ドロップ、「抽出実行」
7. 結果画面で 9カテゴリ判定バッジと §6 エラーフラグを確認 → 不一致フィールドを優先的に検証

詳細な手順は、アプリ内の「**使い方ガイド**」（6セクション）に記載があります。

## 対応モデル（無料枠目安・2026年初頭時点）

| モデル | 精度 | RPM(分) | RPD(日) | 用途 |
|---|---|---|---|---|
| `gemini-2.5-flash-lite` | ★★★ | 10 | 20 | **dual-MODEL モデルA推奨** |
| `gemini-2.5-flash` | ★★★★ | 5 | 20 | **dual-MODEL モデルB推奨** (思考トークン搭載) |

> 上記は2026年初頭の目安。実際の上限は [公式ドキュメント](https://ai.google.dev/gemini-api/docs/rate-limits) を参照。
> **503 発生時は自動的に他モデルへフォールバック**するので、選んだモデルが混雑していても動き続けます。

## API消費量の目安

| モード | 1論文あたりのAPIコール | 無料枠での実用上限 |
|---|---|---|
| **単一モデル (3パス)** | 3コール | **5論文/日** (RPD 20) |
| **🔬 dual-MODEL (3パス × 2モデル)** | 6コール | **3論文/日** |

## なぜ複数キーで無料枠が増えるのか

Google Cloud の無料枠は **プロジェクト単位** で計上されます。

- 同じプロジェクトで複数キーを作っても枠は共有 → 増えません
- **別プロジェクト**でキーを作って本アプリに登録すれば、枠は実質掛け算で拡張

本アプリは登録された複数キーを自動でローテーションするため、レート制限（429）に当たっても別キーで継続実行できます。

## なぜ dual-MODEL モードが効くのか (Vivekanantha 2026 [1] の知見)

- 単一モデル比較研究では性能差が小さい (Elicit vs ChatGPT で性能差なし)
- **dual-LLM の意義は「比較」ではなく「相補」**: 一方の弱点をもう一方が補う
- Vivekanantha [1] 実測: 384データ点中、両モデル一致正解 82%、少なくとも片方が完全正解 95.1%
- **不一致フィールドのみを人間レビューに回せる** → 全件人手確認に比べて負荷激減
- 同じ論文を2モデルで独立抽出し、ヒトが両者の結果を見比べることで、ヒト1名による2回独立抽出 + 競合解決 (Cochrane の標準ワークフロー) の代替になる

## エビデンスベース (本アプリの理論的根拠)

本アプリは以下2つのpeer-reviewed論文の知見に基づく:

[1] **Vivekanantha P, Kahlon H, Balogun OT, et al.** Automated data extraction for systematic reviews using GPT-5.2 and Google Gemini 3 Pro: A dual-large language model approach in orthopaedic research. *Knee Surg Sports Traumatol Arthrosc.* 2026;1-19. doi:[10.1002/ksa.70412](https://doi.org/10.1002/ksa.70412)

[2] **Laignelot F, Martin GL, Ossman M, et al.** Large language models show promising performance for some systematic review tasks but call for cautious implementation: a systematic review. *J Clin Epidemiol.* 2026;194:112221. doi:[10.1016/j.jclinepi.2026.112221](https://doi.org/10.1016/j.jclinepi.2026.112221)

設計仕様の詳細根拠は `Dataex仕様書.md` を参照してください。

## トラブル対処（よくあるもの）

### 🔴 `503 This model is currently experiencing high demand`
本アプリは自動でフォールバック・リトライするので、通常はそのまま完走します。それでもダメなら:
- モデルを **Gemini 2.5 Flash Lite** に切替（無料枠が大きい）
- 別プロジェクトで2個目のキーを発行・登録
- dual-MODEL モードで両方失敗が続く場合 → 単一モデル運転に戻して様子見

### 🟠 `APIキーが無効`
- 前後の空白・改行が混入していないか確認
- AI Studio 側でキーを削除していないか確認
- VPN等で Gemini非対応リージョンになっていないか確認

### 🟡 `Rate limit / Quota exceeded`
- 短時間連投で RPM に当たった可能性 → 1〜2分待つ
- dual-MODEL モードで RPD 20/日 に当たりやすい → 単一モデルに戻すか、別キー追加
- 翌日 UTC 0時（日本朝9時）まで RPD は復活しない

詳細はアプリ内「使い方ガイド ⑥ トラブル対処」を参照。

## セキュリティ

- APIキーはお使いのブラウザの `localStorage` にのみ保存されます（チェックボックスで保存ON/OFF切替可）
- 外部送信は `generativelanguage.googleapis.com` への正規リクエストのみ
- セッション保存時のJSONには **APIキーは含まれません**

## 免責事項

- 本ツールは強力なアシスタントですが、抽出結果は **必ず原論文と照合してください**（Laignelot 2026 [2]: データ抽出 accuracy 0.36–1.00 と幅広い）
- 特に **SD と SE の混同**、図表からの読み取り誤差に注意
- 本アプリは「dual-MODEL 初稿 → ヒト全件検証」を前提設計
- 医学的な最終判断は研究者ご自身で

## バージョン

- [`meta-analysis-extractor v3-opus47.html`](meta-analysis-extractor%20v3-opus47.html) — **最新版** (v3.5 dual-MODEL Edition / Vivekanantha 2026 方式 / §6 エラー検出 / CONSORT-AI Methods 出力)
- [`meta-analysis-extractor v2ー1.html`](meta-analysis-extractor%20v2%E3%83%BC1.html) — 旧版（Gemini API単独・dual-MODEL 非対応）

## 技術スタック

- React 18 (UMD / Babel standalone)
- Tailwind CSS (CDN)
- PDF.js (Mozilla)
- Google Gemini API (`v1beta`) — Google AI Studio 無料枠

## ライセンス

個人利用・研究目的での使用を想定しています。商用利用や再配布の際はご連絡ください。
