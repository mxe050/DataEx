# DataEx 再設計指示 v5
# Paper-first Meta-analysis Candidate Finder
# 「PDFだけでも使える」＋「SRのICOは任意の補助」＋「採用値をその場で確定してCSVへ」

## 0. このv5で最優先する思想

DataExの主役は「細かな抽出条件を入力すること」ではない。

主役は、

> PDFを1本入れる
> → AIが研究デザイン・比較・アウトカム・時点・統計量をかなりファジーに理解
> → 「この比較と、このアウトカム、この数値がメタ解析に使えそうです」と簡潔に提案
> → 数値をクリックすると原著の該当箇所へ移動・ハイライト
> → 必要ならその場で修正
> → 「採用」で確定
> → 採用済みデータ表へ即時反映
> → CSVプレビュー / コピー / 保存
> → 次の論文を追加すると同じReview Workspaceへ蓄積

である。

**PICO/ICOなしでも動くことをメイン機能にする。**

SRで定義済みのIntervention / Comparator / Outcomeがある場合は、
精度向上のため任意で入力できるが、
これは「原著に書いてある検索語」ではなく、
レビュー側の概念（canonical concept）としてファジーに解釈する。

DataExは、
「AIが大量の情報を全部見せるアプリ」ではなく、

**“この論文から、メタ解析に使えそうなものはこれです” を先に見せるアプリ**

にする。

---

# 1. 参考アプリから取り入れる思想

参考：
SR Data Extraction Plugin
https://chromewebstore.google.com/detail/sr-data-extraction-plugin/ibpbkgffgkmdmflamhadbcfjgfljjgip

取り入れるべき考え方：
- AI事前抽出
- 根拠ハイライト
- 人間の accept / edit / reject / not reported
- audit trail
- 確定データのCSV export
- 未検証値をAIのまま自動確定しない

ただしDataExは同じアプリを複製しない。

DataEx独自の中心は：

**論文だけから「比較候補」「アウトカム候補」「メタ解析可能データ」を先に発見するPaper-first discovery**

とする。

---

# 2. 初期画面をさらに簡単にする

現在のReview contextを、初期画面では折りたたむ。

初期画面の主役：

```text
PDFを選択 / ドロップ

[このPDFから使えるデータを探す]
```

その下に：

```text
▶ SR条件を追加すると精度が上がります（任意）
```

を置く。

展開した時だけ：

- Intervention
- Comparator
- Outcomes of interest
- Population（必要なら）
- Review / Project name

を表示。

---

# 3. ICO入力欄には必ずClear操作を付ける

現在の問題：
前回のIntervention / Comparator / Outcomesが残っても、
簡単に消せない。

必須実装：

各欄の右端に小さい `×`：

```text
Intervention [Acupuncture                 ×]
Comparator   [Usual care                  ×]
Outcomes     [Disability                  ×]
```

さらに：

```text
[SR条件をすべてクリア]
```

を設置。

クリア後は即時にDiscovery Modeへ戻る。

誤操作対策：
- Clearは入力値だけを消す
- Review Workspaceの確定データは消さない
- 確定Studyを削除しない

---

# 4. 2つの利用形態。ただし「モード選択」をユーザーに強制しない

## A. Paper-first Discovery（デフォルト）
ICO空欄。

AIがPDFだけから：
- study design
- treatments / comparator candidates
- arm / sequence
- main clinical outcomes
- main timepoints
- numeric results
- meta-analysis usability
を自動発見。

## B. SR-guided Discovery
ICOが入力されている。

Paper-first discoveryを行った上で、
SR側ICOと意味的に近い候補を上位に並べる。

**ICOに合わないOutcomeを全部捨てない。**
「その他の使えるOutcome」として折りたたんで残す。

---

# 5. 抽出後のトップ画面は「比較候補」から始める

研究概要の長文を先に出さない。

例：parallel RCT

```text
Cherkin 2009
4群 並行群RCT

使えそうな比較

① Individualized acupuncture vs Usual care
   主要データ 2アウトカム

② Standardized acupuncture vs Usual care
   主要データ 2アウトカム

③ Simulated acupuncture vs Usual care
   主要データ 2アウトカム

[4群すべてを見る]
```

例：crossover RCT

```text
van de Vusse 2004
Cross-over RCT

使えそうな比較

① Gabapentin vs Placebo
   Pain / Global pain relief / Adverse effects

⚠ Cross-over trial
   sequence別データではなく、paired comparisonを優先します
```

### 重要
Cross-overの
`Gabapentin→Placebo`
`Placebo→Gabapentin`
を「介入群」としてトップ画面に並べない。

これはsequenceであってtreatment armではない。

sequence / period情報は詳細へ。

---

# 6. Outcome Discoveryは「臨床的に重要なもの」を先に

Paper-onlyでもAIは全Outcomeを探してよいが、
画面に最初から全部出さない。

自動priority：

## 最上位
- 原著primary / co-primary
- Abstract Resultsの主要臨床Outcome
- intervention-comparatorで数値比較可能
- meta-analysisに直接/ほぼ直接使える

## 次
- clinically relevant secondary
- responder
- adverse events
- quality of life / function

## 折りたたみ
- resource use
- adherence
- exploratory biomarkers
- baseline-only variables
- methods-only measures

### UI
```text
主要なOutcome 3件
その他のOutcome 8件 ▶
```

---

# 7. 各Outcomeカードは「メタ解析に使える数字」を最初に見せる

### Continuousの例

```text
Roland disability
低いほど良い / 0–23

              Individualized   Standardized   Simulated   Usual care
介入前          10.8 (5.2)      10.8 (5.6)     9.8 (5.2)   11.0 (5.2)
介入後 8週       6.4 (5.3)       6.3 (5.7)     5.4 (4.9)    8.9 (6.0)
変化量           4.4             4.5            4.4          2.1

介入後：Mean (SD)
変化量：Meanのみ、SD未報告
```

**連続変数は基本的にこの3層だけを最初に見せる：**

1. 介入前（baseline）
2. 介入後（post-treatment / endpoint）
3. 介入前後の差（change）

それ以上の情報は詳細へ。

### 複数時点
介入後が複数ある場合：

```text
時点： [8週] [26週] [52週]
```

tab / segmented controlで切替。

長い縦表を作らない。

---

# 8. Continuousデータの統計タイプを必ず識別する

AIは値を見つけるだけでなく、
**「これは何の統計量か」**を分類する。

最低限：

- Mean + SD
- Mean + SE
- Mean + CI
- Change mean + SD
- Adjusted mean difference + CI
- Median + IQR
- Median + range
- LS mean + SE
- standardized mean difference
- その他

### UIに短い注意を出す

#### Mean + SD
```text
✓ RevManの連続値にそのまま使用可能
Mean / SD / n
```

#### Mean + SE
```text
⚠ これはSDではなくSEです
RevManのMean/SD欄へSEをそのまま入れないでください
nが確認できればSDへ変換候補を作れます
[変換候補を見る]
```

#### CI
```text
⚠ 95% CIからSEを求められる可能性があります
[変換候補を見る]
```

#### Adjusted MD
```text
ℹ 調整済み群間差です
arm別Mean/SDとは別物です
Generic inverse varianceで使用候補
```

#### Median / IQR
```text
△ Mean/SDではありません
そのまま通常のMean Differenceには入力できません
変換する場合は方法を明示してください
```

---

# 9. Binary outcomeの標準表示

```text
Global perceived pain relief
Gabapentin   20 / 46
Placebo       8 / 46

形式：Events / Total
✓ 二値アウトカムとして使用候補
```

OR / RRが原著に直接報告されている場合：

```text
Reported effect: OR 0.62 (95% CI ...)
```

と別表示。

### 注意
ORをRRと表示しない。
RRをORと表示しない。

直接events/totalがある場合と、
adjusted ORしかない場合を区別。

---

# 10. Time-to-event

HRを検出した場合：

```text
Overall survival
HR 0.74 (95% CI 0.60–0.91)

形式：Hazard Ratio
ℹ RevManでは通常 log(HR) + SE を
Generic inverse varianceで使用します

[log(HR) / SE変換候補]
```

### 禁止
- HRをRRに変換して通常二値として扱わない
- HRのCIをSDと扱わない

変換値はDerivedとして保存し、
原著HR/CIをRawとして必ず保持。

---

# 11. OR / RR / RD等のガイダンス

各効果量にMeta-analysis hintを付ける。

例：

```text
OR
→ 二値効果量
→ 他研究がRRの場合、そのまま同じ解析に混ぜない

RR
→ 二値効果量

Risk Difference
→ RDとして解析

Adjusted OR / adjusted RR
→ arm-level events/totalとは別
→ Generic inverse variance候補
```

長文説明は出さず、
`i` ボタンで詳細。

---

# 12. Meta-analysis readinessを4段階で表示

各Outcome / result candidateに：

```text
● そのまま使える
● 変換すれば使える
● 確認が必要
● この形では使えない
```

例：

Mean + SD + n
→ そのまま使える

Mean + SE + n
→ 変換すれば使える

Adjusted MD + 95% CI
→ 変換すれば使える / GIV

Median + IQR
→ 確認が必要

percentage only, denominator unknown
→ この形ではevents/totalにできない

---

# 13. Cross-over RCTの表示を専用化

今回のvan de Vusseを重要回帰テストにする。

### トップ表示

```text
Cross-over RCT

比較：
Gabapentin vs Placebo

Sequence:
Gabapentin→Placebo / Placebo→Gabapentin
[詳細]
```

### Main result
可能なら両periodを統合したpaired resultを最上位。

sequence別period値は「詳細」に下げる。

### 警告
```text
⚠ Cross-over
通常の独立2群RCTとして扱わないでください
paired analysis / within-person情報を優先します
```

paired varianceが不足しているなら：

```text
△ 効果方向は確認できますが、
通常のparallel-group Mean/SDとして直接投入しないでください
```

---

# 14. Multi-armも専用化

Paper-onlyで全armを認識。

比較候補をAIが作るが、
shared controlを二重カウントしない。

例：

```text
4群RCT

比較候補
- Individualized vs Usual care
- Standardized vs Usual care
- Simulated vs Usual care

⚠ Usual careは共有対照です
複数のpairwise解析へ同じ対照群をそのまま重複投入しないでください
```

群統合は後から提案。
事前ルール不要。

---

# 15. Click-to-Sourceは今後も中核

各数値を通常クリック：

1. PDF該当page
2. Table/Figure
3. cell / row
4. 黄色ハイライト

Outcomeタイトル：
→ Outcome block

統計注意：
→ その統計量の根拠箇所

### 例
`20/46`
→ p.7 Table 3 の対応セル

---

# 16. 修正 → 採用をもっと直感的に

各Outcomeカードの下：

```text
[✓ このデータを採用]
[✎ 修正]
[保留]
[使わない]
```

### 通常フロー
1. AI候補を見る
2. 数字クリックで原著確認
3. 正しければ「このデータを採用」
4. 違えば「修正」→ 保存 → 「採用」

Outcome全体確定という大きい概念だけでなく、
**メタ解析へ実際に出す“Result set”単位で採用可能**にする。

例：
- Roland 8週 endpoint を採用
- 26週は保留
- 52週は使わない
- changeは使わない

ができること。

---

# 17. 「採用済みデータ」トレイを常時表示

画面下部または左上にsticky：

```text
採用済みデータ  3件
[表示] [CSV]
```

開くと：

| Study | Comparison | Outcome | Time | Data |
|---|---|---|---|---|
| Cherkin | Standardized vs Usual | Roland | 8 wk | Mean/SD |
| ... | ... | ... | ... | ... |

ここが最終的な「meta-analysis basket」。

---

# 18. 採用すると即時CSV候補へ反映

「このデータを採用」を押した瞬間、
Review WorkspaceのFinal datasetへ追加。

CSV画面を開けば即反映。

### 必須
- AI Rawは保持
- Finalは人間決定
- 修正後はFinal値
- 未採用CandidateはCSVへ出さない

---

# 19. CSVは「コピー」が重要

保存だけでなく：

```text
[CSVをコピー]
[CSVを保存]
[TSVをコピー]
```

を付ける。

Excel / RevMan前処理へすぐ貼れること。

### CSV preview
最初にプレビュー。

Continuous：

```text
Study,Outcome,Time,Intervention,N,Mean,SD,Comparator,N,Mean,SD
```

Binary：

```text
Study,Outcome,Time,Intervention,Events,Total,Comparator,Events,Total
```

GIV：

```text
Study,Outcome,EffectType,Effect,SE,Intervention,Comparator
```

Master long formatも保持。

---

# 20. 1つのOutcomeでendpoint/changeを混ぜない

Continuousでは特に重要。

同一Outcomeに：

- baseline
- endpoint
- change

があっても、
CSVへ出すresult typeを明示。

```text
Result type: Endpoint
```

または

```text
Result type: Change
```

### 禁止
- endpoint meanとchange SDを組み合わせる
- baseline SDをpost SDとして使う
- adjusted SEをraw meanに付ける

AIが怪しい組合せを作ったら：
`確認が必要`

---

# 21. Source不足でも候補は見せる

DataExはoverblockingしない。

例：

```text
Pain at 3 weeks
Mean 4.2
SE 0.3
n 不明

△ 候補
nを確認できればSD変換可能
```

と出す。

完全に隠さない。

---

# 22. 画面の情報量ルール

初期表示で同時に見せるのは：

- Study design 1行
- comparison候補 1～3
- main outcomes 3～5
- 代表時点
- 値
- meta-analysis readiness
- 採用ボタン

のみ。

以下は折りたたみ：
- detailed methods
- full source trace
- all Raw
- sequence/period detail
- adjusted variants
- baseline details
- secondary exploratory outcomes
- audit history

---

# 23. 「何を選べばよいか」もAIが提案

例：

```text
AI提案
この論文では8週のendpoint Mean(SD)が
最もメタ解析へ使いやすい候補です。

理由：
- primary assessment time
- 4群すべて報告
- Mean + SDが直接報告
```

短く3行以内。

ただし自動確定しない。

---

# 24. Paper-only時の理想出力

PDFを1本入れてボタンを押すだけ。

例：

```text
この論文から3つの比較可能なOutcomeを見つけました

Gabapentin vs Placebo
Cross-over RCT

1. Global perceived pain relief
   20/46 vs 8/46
   ● そのまま使える（二値）
   [原著] [採用]

2. VAS pain
   endpoint / change候補あり
   △ Cross-over解析の確認が必要
   [原著] [詳細]

3. Adverse effects
   events / totalあり
   ● 使用候補
   [原著] [採用]

その他 4件 ▶
```

これがDataExの中心体験。

---

# 25. SR-guided時の理想出力

入力：

```text
I: Gabapentin
C: Placebo
O: Pain
```

結果：

```text
SR Outcome: Pain

最も近い原著Outcome
1. VAS pain level
2. Global perceived pain relief
   ※ pain improvementの二値Outcomeとして別に保持

その他のOutcome ▶
```

完全一致検索にしない。

---

# 26. Reset / New paper workflow

必須ボタン：

```text
[SR条件をすべてクリア]
[新しいPDFを解析]
```

「新しいPDFを解析」：
- 現在のPDF選択解除
- 現在のCandidate表示解除
- ICOは「保持 / クリア」を選べる

```text
次の論文へ
○ SR条件を保持
○ SR条件をクリア
```

Review Workspaceの確定済みデータは保持。

---

# 27. v5受入テスト

## A. Clear
前回I=Acupuncture / C=Usual careが残る。
各×と「すべてクリア」で即座に空欄。
Review Workspaceは消えない。

## B. Paper-only Cherkin
ICOなし。
4群RCTを認識。
主要OutcomeにRoland / Bothersomeness。
使える比較候補を提示。

## C. Paper-only van de Vusse
ICOなし。
Cross-over RCTを認識。
トップ比較はGabapentin vs Placebo。
sequenceをarmとして表示しない。

## D. van de Vusse Global perceived pain relief
両periodの主candidateを見せる。
Events/Totalが直接あればbinary usableとして表示。
数値クリックでTable 3へ。

## E. Cross-over guidance
parallel-groupとして直接投入しない注意を表示。

## F. Continuous
baseline / post / changeを3層で表示。
統計タイプをSD / SE / CIで正しく区別。

## G. SE
SEを検出した場合、
「SDではない」を明示。
SEをRevManのSD欄へそのまま入れない注意。

## H. HR
HR + CIを検出。
log(HR)+SE / GIV候補を提示。
HRをRRへ変換しない。

## I. Edit
AI値を修正。
Raw保持、Final変更。

## J. Accept
採用ボタンでFinal datasetへ即反映。

## K. Basket
採用済みデータ件数増加。
クリックで一覧。

## L. CSV copy
CSVコピー → クリップボード文字列がpreviewと一致。

## M. New paper
SR条件保持/クリア選択。
確定済みReview Workspaceは維持。

---

# 28. 既存で維持するもの

- PDF.js viewer
- PDF検索
- native text selection
- 範囲選択
- 図表選択
- caption取得
- 黄色ハイライト
- Click-to-Source
- SourceAnchor
- Fuzzy Core
- AI Raw / Final分離
- edit history
- Review Workspace
- IndexedDB
- CSV audit
- 既存回帰テスト

---

# 29. 今回やらないこと

- 事前にStudy Designを選ばせる
- 事前にData Typeを選ばせる
- 事前にSD/SE/HRなどを指定させる
- 事前にtimepoint ruleを入力させる
- 事前にnode ruleを入力させる
- 事前にdenominator ruleを入力させる
- 大量のtechnical warningを最初から見せる
- AI候補を無確認でCSVへ自動採用

---

# 30. 実装順序

### Phase V5-A
初期画面簡素化
- SR条件折りたたみ
- 各ICO Clear
- 全Clear
- New paper

### Phase V5-B
Paper-first comparison discovery UI
- study design
- comparison cards
- primary outcomes ranking

### Phase V5-C
Meta-analysis readiness classifier
- continuous SD/SE/CI
- binary events/total
- OR/RR/RD
- HR
- adjusted effect
- median/IQR

### Phase V5-D
Continuous 3-layer UI
- baseline
- post
- change

### Phase V5-E
Cross-over / multi-arm presentation rules

### Phase V5-F
Result-level accept/edit/hold/reject

### Phase V5-G
Accepted-data basket + CSV copy

### Phase V5-H
Cherkin + van de Vusse acceptance tests

---

# 31. 最終的な製品像

DataExの理想は：

> 「PDFを入れたら、AIが勝手に論文を読んで、
> “この比較なら、このOutcomeのこの値がメタ解析に使えそうです”
> と出してくれる。
> 数字を押せば原著が黄色く光る。
> 間違っていれば直す。
> 良ければ採用。
> 採用したものだけがCSVにたまる。」

これを最優先する。

研究者が抽出ルールを細かく入力しなければ動かない設計へ戻さない。

**Paper first. Candidate first. Evidence one click away. Human final. CSV immediately usable.**
