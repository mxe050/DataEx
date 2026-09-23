# RECOVERY 2020 — reported effect type修正・回帰確認

2026-09-12。作業ブランチ: `dataex-chatgpt-phase1`。

## 修正結果

保存済みRECOVERY Table 2の脚注をOutcomeごとに照合し、原著の報告名と推定方法を別に保持する。列見出し `Rate or Risk Ratio (95% CI)` 単独では分類しない。Cox regressionという推定方法から、報告名をHRへ置き換えない。

| Outcome | 原著effect [95% CI] | 分類 | GIV Effect_Type | Derived SE |
|---|---|---|---|---|
| Mortality at 28 days | 0.83 [0.75, 0.93] | Age-adjusted rate ratio | log Rate Ratio | 0.054876359876238935 |
| Discharged from hospital within 28 days | 1.10 [1.03, 1.17] | Age-adjusted rate ratio | log Rate Ratio | 0.03251206312159822 |
| Invasive mechanical ventilation or death | 0.92 [0.84, 1.01] | Age-adjusted risk ratio | log Risk Ratio | 0.04701711817103424 |
| Invasive mechanical ventilation | 0.77 [0.62, 0.95] | Age-adjusted risk ratio | log Risk Ratio | 0.10886488388446144 |
| Death — composite subcomponent | 0.93 [0.84, 1.03] | Age-adjusted risk ratio | log Risk Ratio | 0.05201937111761293 |

Derived effect = ln(reported ratio)。Derived SE = (ln(CI upper) − ln(CI lower)) / (2 × 1.959964)。正規近似・原著の丸めによる変換候補として保存する。比や方向を反転しない。

Rawの旧effectMeasure（HR/HR/RR/RR/RR）とeffect/CIは元の抽出履歴として保持する。訂正された分類、分類根拠のsource ID・引用、推定方法、Derivedを別レイヤーに保存し、画面のガイダンスとGIVへ渡す。人間がDerivedを採用するまでGIVへ出力しない。古い誤分類で採用済みだった候補は、履歴を保持して再採用を求める。

## 変更ファイル

- `dataex-effect-type.js`: 原著の効果名の分類・出典付き分類メタデータ。
- `dataex-paper-model.js`: 分類とlog/SE候補の接続。version 5.0.2で保存済み候補を更新。
- `dataex-results-ui.js`: rate/riskを区別したラベル・変換ガイダンス。
- `dataex-review-workspace.js`: Rawとは別に分類・Derivedを保存。
- `dataex-decisions.js`: GIVの効果名区別、未変換比・旧分類候補の出力保留。
- `dataex-chatgpt.html`: 分類モジュールの読み込み。
- `dataex-recovery-effect.fixture.cjs`: 保存済み5 Raw行・脚注に基づくテスト用subset。実Reviewには投入しない。
- `dataex-recovery-effect.test.cjs`: 新規21テスト。
- 本報告書。

## 検証

対象自動テスト **222/222合格**（既存201、新規21）。

| 既存テスト | 合格数 |
|---|---:|
| Paper model | 56 |
| Paper decisions | 24 |
| Moffett GIV | 21 |
| Foster result conflicts | 17 |
| Decisions | 23 |
| Final review | 20 |
| Results model | 20 |
| Fuzzy Core | 20 |

新規では5 Outcomeの分類・log/SE、曖昧な列の保留、矛盾する根拠の保留、他Tableの脚注排除、HR/ORの保持、Raw不変、人間の採用後のみGIV出力、rate/riskのCSV区別、旧HR採用履歴の保持と出力保留を確認した。

実画面: `http://127.0.0.1:8766/dataex-chatgpt.html`。既存起動スクリプトでAlreadyRunningを確認。保存済み `RECOVERY 2020 validation` を開き、同じ原著PDFを再接続して確認した。再抽出・dataex_set_resultsは実行していない。

- 5つのResult cardすべてで正しい効果名・log/SE・GIVガイダンスを確認。
- 5つのDerived詳細で元effect/CI・95%水準・log値・SE・分類根拠を確認。
- 保存された死亡の変換候補ダイアログでも `log Rate Ratio` を確認。採用操作は行わず、実Reviewのbasketは0件を保持。
- Raw全82件をUIで読み取り、変更前の凍結済みauditと、数値・効果名・群・Outcome・時点・解析集団・分母種別・調整記述・sourceRefsの一致を照合。正規化文字列長34698、FNV-1a 64指紋 `62c5c3e3b8e2937b` が一致。
- `0.83 [0.75, 0.93]` をクリックするとPDF p.9 Table 2の該当値へ移動し、黄色ハイライトが表示された。
- Fuzzy CoreファイルSHA256は変更前後とも `4FBBA72FD3A250540D800639FFDA06F5E9E3B0E123F034C8C0700DD29EAC773A`。
- `git diff --check` 合格。mainへのcommit・merge・pushなし。

全ブラウザ回帰スイートの再実行は行っていない。GIV採用とCSV内容は独立したテストrecordで検証し、実Reviewの人間の判断は追加していない。分類根拠が不足・矛盾する場合は確認待ちとし、混在した列名から一律に推測しない。
