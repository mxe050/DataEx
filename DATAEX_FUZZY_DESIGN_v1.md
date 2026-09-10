# Codex実装指示
# DataEx 根本再設計：Fuzzy Data Extraction Workspace v1

## 0. 今回の方針転換

現在のDataExは、正確な抽出を狙うあまり、
Study Design / Data Type / Requested Statistics / Analysis Population /
Scale / Time Origin / Time Selection Rule / Synthesis Node Rule などを
利用者が細かく事前指定する設計へ寄りすぎている。

これは今回の目的に反する。

本来の目的は、

> PDFを入れる
> → PICO程度、場合によってはアウトカム名だけ、あるいはアウトカム未指定でも
> → AIが論文から研究デザイン、群、アウトカム、尺度、時点、統計量を自動判定
> → メタ解析に使えそうなデータを候補として構造化
> → 曖昧な点だけ後から人に確認
> → 研究を追加するたびにデータが蓄積
> → 最後にRevMan等へ持っていける

という流れである。

したがって、DataExを「細かな抽出ルール入力フォーム」ではなく、
**Fuzzy Data Extraction Workspace**として根本的に再設計する。

---

# 1. 絶対に残す既存機能

現在すでに動いている以下は壊さない。

- PDFアップロード
- PDFビューア
- PDF内検索
- テキスト選択
- 範囲選択
- 図選択
- 図注自動取得
- 黄色ハイライト
- 既存のSource Trace関連基盤
- 既存テスト
- Phase 3.2.2までの図・caption処理

今回の変更は、**抽出設定・Prompt生成・抽出結果管理の思想を変える**ものであり、
PDF閲覧・ハイライト基盤を捨てるものではない。

---

# 2. 利用者が最初に入力する項目を大幅に減らす

## 標準画面に残すもの

### A. Review / Project name
任意。

### B. Population
任意。
例：
Adults with chronic low back pain

### C. Intervention
任意だが、分かる場合は入力。
例：
Acupuncture

### D. Comparator
任意。
例：
Usual care

### E. Outcomes of interest
**任意。空欄可。**

例：
Pain
Disability

アウトカム未指定なら、
AIが論文からメタ解析候補となるアウトカムを自動発見する。

### F. PDF
1研究でも複数研究でもアップロード可。

---

# 3. 標準画面から外すもの

以下は利用者に原則入力させない。

- Study Design
- Data Type
- Requested Statistics
- Analysis Population / Denominator
- Scale / Unit
- Time Origin
- Time Selection Rule
- Synthesis Node Rule
- outcome-specific detailed rules
- Core Promptの細かなパラメータ

これらは**AIがPDFから自動推定する内部属性**へ移す。

Advancedに隠して残すことも原則しない。

どうしても研究者が上書きしたい場合だけ、
抽出後の「修正・確認」画面から変更できるようにする。

---

# 4. 抽出モード

利用者が選ばなくても自動で動くが、概念として2モードを持つ。

## 4.1 Discovery Mode
Outcomes欄が空欄の場合。

AIは論文から、

- 研究デザイン
- randomized / treated / analyzed population
- arm構成
- primary / secondary outcomes
- continuous / binary / time-to-event / count-rate
- scale / unit
- timepoint
- endpoint / change score
- mean / SD / SE / CI
- events / total
- adjusted effects
- safety outcomes

を自動発見する。

「この論文からメタ解析に使えそうなデータ一覧」を作る。

## 4.2 Targeted Fuzzy Mode
Outcomes欄に
Pain
Disability
Adverse events
などだけ入っている場合。

完全一致語を探すのではなく、
意味的に近いアウトカムを自動対応する。

例：
Pain
→ pain intensity
→ overall pain
→ spontaneous pain
→ VAS pain
→ NRS pain

ただし、
pain interference / pressure pain thresholdなど、
臨床概念が異なるものは別候補として扱う。

---

# 5. Fuzzy抽出の基本思想

## 5.1 Best effort first
最初から「仕様不足」で止めない。

まずAIが最も妥当な候補を抽出する。

## 5.2 Uncertainty second
不確実性は後から表示する。

例：
- この2尺度は同じアウトカムとしてまとめますか？
- 0–10と0–100を共通尺度へ変換しますか？
- week 8とweek 12のどちらを代表時点にしますか？
- この2用量群を同じnodeとしてまとめますか？

## 5.3 人に聞くのは、解析結果が変わる場合だけ
細かな定義確認を毎回聞かない。

## 5.4 AI推奨を表示
質問するときは、

「AI推奨：同一アウトカムとして扱う」
「AI推奨：0–100へ線形換算」

のようにデフォルト候補を示す。

利用者は
- 採用
- 別扱い
- 保留
の3択程度で済むようにする。

---

# 6. 内部AI処理は複数段階に分ける

利用者には見せなくてよい。

## Pass 1：Study structure
PDFから自動判定：
- study design
- arms
- randomized n
- treated n
- analyzed n
- safety n
- analysis unit
- follow-up

## Pass 2：Outcome inventory
論文にあるアウトカム候補を可能な限り列挙。

各候補に：
- raw outcome name
- canonical concept candidate
- data type
- instrument
- scale
- direction
- timepoint
- result type
- source location

## Pass 3：Numeric extraction
メタ解析に必要な数値を抽出。

continuous：
- n
- mean
- SD
- SE
- CI
- change mean
- change SD

binary：
- events
- total

time-to-event：
- HR
- CI

count/rate：
- event count
- person-time

## Pass 4：Normalization proposals
自動で候補を作る。

例：
- VAS 0–10 → 0–100
- SEM → SD
- 90%CI → SE
- 同義アウトカムのcluster
- 時点の近接cluster
- multi-arm node候補

## Pass 5：Analysis-ready candidates
元データを保持したまま、
meta-analysisへ入れられる候補表を作る。

---

# 7. 最も重要：Rawデータは必ず保持する

内部構造は最低でも：
1. Raw
2. Normalized candidate
3. Analysis-ready candidate
の3層にする。

AIが尺度変換しても元の0–10値を消さない。
AIがSE→SD変換しても元のSEを消さない。

---

# 8. Outcome自動発見

Outcomes未指定でも、次のような一覧を出す。

| Reported outcome | AI concept | Type | Scale | Timepoints | Meta-analysis ready |
|---|---|---|---|---|---|
| Roland score | Disability | continuous | 0–23 | 8,26,52 wk | Yes |
| Symptom bothersomeness | Symptoms | continuous | 0–10 | 8,26,52 wk | Yes |
| ≥3 point improvement | Disability responder | binary | events/total | 8 wk | Yes |
| Adverse events | Safety | binary | events/total | study period | Yes |

利用者は「このアウトカムをレビューに追加」だけ押せる。

---

# 9. Outcomeの蓄積

複数研究を追加すると、
各研究のreported outcomeを自動でcanonical outcomeへ寄せる。

例：
Study A: Pain VAS
Study B: Pain intensity NRS
Study C: Overall pain score

↓ AI提案

Canonical outcome:
Pain intensity

利用者に一度だけ：
「この3つをPain intensityとしてまとめますか？」
と聞く。

採用した対応ルールはreview workspace内で記憶し、
以後の研究へ自動適用する。

---

# 10. 時点もFuzzyにまとめる

研究ごとに：
- day 7
- week 2
- week 4
- week 8
- month 3
などが違う。

AIは自動で候補clusterを作る。

例：
- immediate
- short term
- intermediate
- long term

ただし、レビューで明示時点が設定されている場合はそれを優先。
利用者が何も決めていなければ、まず全時点を保持し、後からまとめられるようにする。

最初から時点選択ルールを入力させない。

---

# 11. Multi-arm研究

利用者に事前node ruleを入力させない。

AIがarmを全部抽出する。

例：
- Individualized acupuncture
- Standardized acupuncture
- Simulated acupuncture
- Usual care

その後AIが、
「Individualized + StandardizedはReal acupunctureとしてまとめられます」
「Simulatedはshamとして別nodeが妥当です」
と提案する。

利用者はワンクリックで採用できる。
元armデータは残す。

---

# 12. Crossover / cluster / cohort

研究デザインもAIが自動判定する。

special designを検出した場合だけ、抽出結果に小さく表示：
「Crossover RCTを検出しました。paired dataを優先して抽出しています。」

利用者に事前指定させない。

解析に必要な情報が足りない場合だけ、後から確認を出す。

---

# 13. Source Traceは現在より強化して残す

各値に：
- PDF file
- PDF page
- printed page
- section
- Table / Figure
- row
- column
- direct value
を持たせる。

画面では短く：
`p.5 / Table 2 / Week 8 / Intervention`
と表示。

クリックしたらPDFの該当位置を開けるよう、将来拡張可能なIDを持たせる。
現在の黄色ハイライト機能を活かす。

---

# 14. 結果画面を中心に再設計

抽出後の最初の画面は「設定不足警告」ではなく、**抽出結果一覧**。

## 14.1 Study summary
- design
- arms
- randomized n
- follow-up

## 14.2 Outcome inventory
論文に見つかったアウトカム一覧。

## 14.3 Meta-analysis candidates

### Continuous
| Outcome | Time | Arm | n | Mean | SD | Source |

### Binary
| Outcome | Time | Arm | Events | Total | Source |

## 14.4 Needs review
本当に判断が必要なものだけ。最大でも数件に抑える。

---

# 15. 「確認カード」のUX

### 尺度
Pain intensityが0–10 NRSと0–100 VASで報告されています。

AI推奨：
0–100へ統一して同一アウトカムとして扱う

[採用] [別々にする] [保留]

### 時点
このレビューにはweek 8とweek 12の候補があります。

AI推奨：
short-termとしてweek 12を代表値にする

[採用] [week 8] [両方保持]

### multi-arm
Individualized acupunctureとStandardized acupunctureを
Real acupunctureとしてまとめますか？

AI推奨：まとめる

[まとめる] [別node] [保留]

---

# 16. 研究データの蓄積

DataExを「1論文抽出ツール」で終わらせない。

Review Workspace内に：
Study 1
Study 2
Study 3
...
を蓄積する。

各studyに：
- PDF
- arms
- outcomes
- raw values
- normalized values
- source trace
- review decisions
を保存。

---

# 17. Review-level Matrix

研究が増えたら自動で横断表を作る。

| Study | Pain short-term | Disability short-term | AE |
|---|---|---|---|
| Study A | Ready | Ready | Missing |
| Study B | Ready | Ready | Ready |
| Study C | Needs review | Ready | Ready |

---

# 18. RevMan / meta-analysis export

最終目標としてexportを実装可能なデータ構造にする。

## Continuous CSV
- Study
- Outcome
- Time
- Intervention label
- Intervention N
- Intervention Mean
- Intervention SD
- Comparator label
- Comparator N
- Comparator Mean
- Comparator SD

## Binary CSV
- Study
- Outcome
- Time
- Intervention events
- Intervention total
- Comparator events
- Comparator total

## Generic inverse variance
- Study
- Outcome
- Effect type
- Effect estimate
- SE

JSONも保持。
最初からRevMan XMLを無理に作らなくてよい。まずCSV/TSVを確実にする。

---

# 19. Prompt Builderの位置づけを変更

現在の「巨大なPromptを利用者が設定して作る」思想はやめる。

Core Promptは内部固定。
利用者は細かなPromptを意識しない。

必要なら「AI抽出用プロンプトを表示」という詳細メニューから確認・コピーできるだけでよい。

Promptは以下の入力から自動生成：
- optional PICO
- optional outcomes
- PDF manifest
- review workspaceで既に学習したmapping decisions

---

# 20. Fuzzy Core Promptの思想

新Core Promptは、
「ユーザーが事前指定した厳密ルールに従って抽出」
ではなく、

**「論文を理解して候補を最大限発見し、メタ解析へ使えそうな形まで自動的に整理し、曖昧さだけ明示する」**

ことを主目的にする。

重要：
- overblocking禁止
- 仕様不足で停止しない
- best candidateを必ず提示
- confidenceを付ける
- 原値を保持
- 推測と原文を区別
- 誤った確定より候補提示
- しかし単なる「不明」で逃げない

---

# 21. 標準ワークフロー

新しい標準操作はこれだけにする。

1. PDFを入れる
2. PICOを入れる（任意）
3. Outcomesを入れる（任意）
4. 「抽出」
5. AIがアウトカムとデータを自動発見
6. 必要なら2〜3個の確認カードに答える
7. StudyをReview Workspaceへ追加
8. 次のPDFを入れる
9. データが蓄積
10. RevMan用CSVへ出力

---

# 22. 既存UIの変更

現在の左側：
- Intervention
- Comparator
- Outcomes
- Timepoint
- Advanced
- Prompt Builder

を整理。

新UI：

### Review context
- Population（任意）
- Intervention（任意）
- Comparator（任意）
- Outcomes of interest（任意）

### PDF
既存

### Primary action
**「このPDFからデータを抽出」**

### Advanced
原則削除。
詳細設定は抽出後の候補修正へ移動。

---

# 23. 実装順序

## Phase A
UIを簡素化。細かな事前設定を標準画面から削除。

## Phase B
Fuzzy extraction Coreを実装。Outcome discoveryを追加。

## Phase C
結果画面：Outcome inventory + Meta-analysis candidate table。

## Phase D
確認カード。

## Phase E
Review Workspace蓄積。

## Phase F
CSV export。

一度に全部作り直さず、既存PDF viewer/highlightを保ったまま段階的に移行する。

---

# 24. 今回の受入条件

### Test 1
PICOのみ、Outcome空欄でPDFを入れる。
→ AIが主要アウトカム候補を自動抽出。

### Test 2
Outcomeに「Pain」だけ。
→ VAS/NRS等のpain-intensity候補を自動抽出。

### Test 3
multi-arm RCT。
→ 事前node ruleなしで全armを抽出し、後からnode統合案を提案。

### Test 4
scale差。
→ 0–10 / 0–100を検出し、自動換算候補を提案。

### Test 5
複数timepoint。
→ 全時点を保持し、代表時点候補だけ後から提示。

### Test 6
2研究目を追加。
→ 同じcanonical outcomeへ自動mapping候補を提示。

### Test 7
RevMan-compatible CSV候補を生成。

---

# 25. 今回やらないこと

- APIキー入力
- OpenAI API課金型接続
- 自動外部送信
- 既存PDF viewerの作り直し
- 既存ハイライト機能の削除
- 厳密なReview eligibility screening
- 複雑な方法論設定を事前入力させる設計

---

# 26. 完了時にCodexが報告すること

- 削除した事前入力項目
- 残した既存機能
- 新しいFuzzy extraction flow
- Outcome discoveryの実装場所
- Study dataの保存構造
- Review Workspace構造
- 追加テスト
- 既存テストの結果
- 未実装項目
- 次Phase

## 最重要

今回の目的は
「利用者が正しい抽出ルールを細かく入力するアプリ」
ではない。

**AIがPDFを読んで、かなりの部分を自動判断し、
人間は曖昧な部分だけ直すアプリ**
にする。

この方針から外れる実装はしないこと。
