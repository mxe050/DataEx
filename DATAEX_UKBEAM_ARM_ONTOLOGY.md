# UK BEAM 2004 — arm/node ontology・Result UI 修正

検証日: 2026-09-12〜13 / 作業ブランチ: `dataex-chatgpt-phase1`

保存済みUK BEAM Rawだけで実装・検証した。AI再抽出、Raw数値の訂正、Fuzzy Coreの変更、mainへのmerge・push・commitは行っていない。

## 変更内容

Rawのstudy.armsは保存したまま、表示・解析候補用の参照モデルで三層を分離した。

|層|内容|
|---|---|
|Original randomized arms|Best care / Best care + exercise / private manipulation / NHS manipulation / private manipulation + exercise / NHS manipulation + exercise の6割付群|
|Derived analysis nodes|Best care、Exercise、Manipulation（NHS/private pooled）、Manipulation + exercise（NHS/private pooled）の4ノード|
|Study metadata|All participants（1334人）。Treatment armや独立した解析比較にしない|

Best care・Exerciseは元の割付群と同一の解析ノード。A7はA3+A4、A8はA5+A6という保存済みroleの構成群IDを参照する。数値を合算して新しい群を生成しない。poolの構成が明示されていなければ推測しない。

初期のOutcome表示は選択した比較の2ノードを表示する。元の6群、4ノードの構成、研究全体の記述値を別々の詳細へ残した。pooled nodeには `Derived / pooled analysis node` を表示する。

調整済み対照平均はTable 2・3・4で異なるため、Outcome・時点・comparisonに加えて元の表/解析モデルを対応づける。別表の対照値を同一セルや同一Result setへ混ぜない。数値のSourceAnchor、Raw/Finalの分離、既存の修正・採用UIを再利用する。

## 実画面で確認した数値

Roland disability、3 months、すべてControl − Intervention。

|比較|Best care（SE）, n|介入（SE）, n|Reported adjusted net benefit [95% CI]|表示SE|数値クリック|
|---|---|---|---|---|---|
|Exercise|6.83 (0.28), 256|5.47 (0.29), 225|1.36 [0.63, 2.10]|0.375|PDF p.6、Table 2、黄色表示|
|Manipulation|6.66 (0.30), 256|5.09 (0.28), 287|1.57 [0.82, 2.32]|0.383|PDF p.6、Table 3、黄色表示|
|Manipulation + exercise|6.71 (0.28), 256|4.84 (0.28), 258|1.87 [1.15, 2.60]|0.370|PDF p.7、Table 4、黄色表示|

SEは既存の95% CI変換候補を利用する。Raw effect・CI・方向は変更しない。調整平均のSEを群内SDに転用しない。

## CSV・重複保護

- All participantsは治療群選択から除外し、古い選択/採用済みデータに含まれていても通常の分析CSVへ出力しない。
- Master/auditのRaw履歴は保持し、Study metadataのarm/comparator列は空にして記述値と明記する。auditのraw_value内には元の記録をそのまま残す。
- 同じStudy・Outcome・Timepointで共有参加者のあるfactorial contrastを採用する際は明示的な確認を要求する。両方の候補を保持しても、未解決のまま通常のpairwise/GIV CSVへ同時出力しない。
- 採用時、basket、CSVで同じ依存関係ガードを使う。元の割付群と、その群を含むpoolを独立2群として比較することも防ぐ。
- controlの分割、群統合、effect directionの反転、Visual estimateの自動採用は行わない。

## 検証

**Nodeの291/291項目合格（既存265＋追加26）**。Moffett GIV、RECOVERY effect type、Foster result-set conflicts、Paper-first、Decision/Final、Fuzzy、Source navigation、Phase 3.2.1/3.2.2等の既存ユニットチェックを含む。

**内蔵ブラウザで、保存済みRaw全文を入力した26/26項目合格**。fixtureの再構成だけでなく、実際に保存した238 Raw・52 sourcesを専用検証画面へ渡した。検証画面はメモリ上のコピーで採用/置換/CSV制約を検証し、実Review Workspaceへテスト用採用を書き込まない。

さらに通常のDataEx画面で、次を確認した。

1. 3×2 factorial、6 randomized groups、4 analysis nodesの表示。
2. 初期比較はExercise / Manipulation / Manipulation + exerciseの3つ。元のsetting別群とAll participantsが比較メニューに混在しない。
3. Rolandカードの比較切替と上記3行の平均・SE・n・効果・CI・Derived SE。
4. Table 2・3・4へのClick-to-Sourceと黄色ハイライト。
5. 6元群、4ノード、Study metadataの各詳細表示。
6. Continuous pairwise CSV画面のI/C選択肢にAll participantsがなく、pooled nodeには識別表示がある。
7. 更新後のRaw / Traceを全12ページ開き、全238件・238個の固有IDについて、全フィールドが保存時のRawと一致することを確認（JSONキー順序は正規化して比較）。数値だけでなく、群ID、時点、分母、sourceRefs、adjustment等も一致。
8. Figure 2のBaseline・3 months・1 yearの3候補（計12群×時点の概算）を保持。更新前後の全表示テキストが一致し、いずれも未確認・図からの概算のまま。実レビューの採用済みbasketは0件。

ブラウザ検証のRaw入力ハッシュは前後とも
`86cb5208d5ee88e4c88967d80c8a7ccd24dd0d386bbda6603f82c22c292ccde9`。

`dataex-fuzzy-core.js`、`dataex-fuzzy-workspace.js`、`dataex-effect-type.js`、`dataex-source-navigation.js`、`dataex-visual.js`は作業開始時コピーとSHA-256が一致した。Fuzzy CoreのSHA-256:
`4fbba72fd3a250540d800639ffda06f5e9e3b0e123f034c8c0700dd29eac773a`。

従来のPlaywright自動ブラウザスイート全件の再実行はしていない。今回のブラウザ受入確認はCUA経由の実画面と専用検証ページで実施した。

## 今回の変更ファイル

実装:
- `dataex-arm-ontology.js`（新規）
- `dataex-paper-model.js`
- `dataex-results-ui.js`
- `dataex-decisions.js`
- `dataex-review-workspace.js`
- `dataex-paper.css`
- `dataex-chatgpt.html`（ontologyスクリプトの読込み追加）

検証・記録:
- `dataex-ukbeam-checks.js`（Node/ブラウザ共通26チェック）
- `dataex-ukbeam.test.cjs`
- `dataex-ukbeam.fixture.cjs`（保存済み数値チェックポイントのテスト用投影。再抽出ではない）
- `dataex-ukbeam-checkpoint.json`（既存の数値バックアップのコピー。直接import用ではない）
- `dataex-ukbeam.validation.html`（通常アプリの状態へ書き込まない検証ページ）
- この報告書

既存の未commit変更は維持した。

## 制限・既存の復帰経路の注意

poolの構成IDが不明な場合や、元の表/解析モデルが一致しない場合は、自動で推測せずCSVを保留する。独立性を考慮した多変量モデルや対照群分割は今回実装していない。

既存の「保存済みStudyを先に開く→PDFを再接続する」経路では、図候補が復帰しない場合を確認した。今回の完了画面では、元タブに残る図候補を保存してから更新し、PDF選択から直接再接続することで3件を復元・全表示一致を確認済み。保存/復帰ロジックは今回の指定範囲外として変更していない。

完了画面は `http://127.0.0.1:8766/dataex-chatgpt.html` の元のタブ。Roland / Exercise / 3 monthsの候補とTable 2を表示する。
