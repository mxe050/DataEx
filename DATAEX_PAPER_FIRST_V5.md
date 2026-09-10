# DataEx Paper-first v5 実装・受入報告

実施日：2026-09-10。Paper UX / model version：5.0.0。Fuzzy Core：fuzzy-1.0.0（変更なし）。

Paper-onlyを標準操作にし、ICOを任意の折りたたみ補助へ変更しました。臨床比較と主要Resultを先に表示し、数値から原著確認、Final修正、Result set採用、採用済みbasket、CSV/TSVコピー・保存までを接続しました。

## 今後の設計方針

ユーザー指定v5仕様をリポジトリの `DATAEX_UX_V5.md` に保存し、`AGENTS.md` から最上位UX方針として参照します。詳細な事前入力が必須になる設計へ戻しません。新しいユーザーの明示指示を優先します。

## 実装内容

- 初期操作はPDF選択と「このPDFから使えるデータを探す」。ICO・Population・Review名は任意の折りたたみ内。
- ICO各欄の×、SR条件全クリア、新しいPDFの保持／クリア選択を追加。Clearは保存済みStudy・採用値・auditを削除しません。
- 研究デザインを1行で表示。Cherkinは3つの介入対Usual care比較、van de VusseはGabapentin vs Placeboを先頭に表示。
- 主要Outcomeは3～5件を優先。その他、Raw、Trace、sequence/period、詳細な警告は折りたたみ。
- continuousはbaseline／post／changeの3層と時点切替。endpointとchange、adjusted effectを別Result setとして扱います。
- SD／SE／CI、change、adjusted MD、OR／RR／RD／HR、median等の統計タイプと、4段階の使用可否・短い扱い方を表示。
- SE→SDやCI→SE、log(HR/OR/RR)等は前提を満たす場合のDerived候補。式、入力、出典、前提を保持し、明示的な採用操作でのみCSVへ反映します。
- Result setはOutcome・比較・時点・result type単位。修正はFinalの下書きとなり、採用後にbasketへ即反映。別時点の保留／除外は採用済み時点を消しません。
- 採用後の編集は該当setの出力を一旦解除。再採用が必要です。古いCSVプレビューや別Studyの換算確認から誤って出力する操作も防止します。
- basketは常時表示。Master long／Continuous／Binary／GIVを全文プレビューし、CSVコピー、TSVコピー、CSV保存が可能。Clipboard API失敗時はtextarea全選択によるcopyへフォールバック。
- 既存のOutcome／Study確定、Review Workspace、audit CSVを維持。次のPDFは選択中Reviewへ継続保存します。

## 原値と解析上の注意

Rawを不変に保持し、Final・Derived・採用履歴を分離しています。SEをSDへ置換しません。HRをRRに変更しません。未知の分母やpaired varianceを補いません。

van de Vusseの20/46対8/46は、臨床比較のbinary候補として前面表示しますが、同じ参加者のcrossoverデータです。独立2群として直接投入可能とは表示しません。新旧のContinuous／Binary CSV経路でも独立群扱いを防ぎ、Masterには原値と注意を残します。

Cherkinの共有対照は複数比較への重複投入を検知します。Masterには共有対照の注記を付け、pairwise出力では明示した比較を選択します。自動で対照群を分割・統合する実装は追加していません。

換算の根拠は [Cochrane Handbook chapter 6](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06) と [chapter 23](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-23)。CI換算では信頼水準・標本数・対称性・調整／対応解析等を確認し、前提不足は候補と注意を残します。

## v5受入テスト A〜M

| 条件 | 確認結果 |
|---|---|
| A Clear | 個別・全Clear、Paper-only復帰、Review名と保存データ保持：合格 |
| B Paper-only Cherkin | ICO空欄、4群・3比較、Roland／Bothersomeness、Raw 163件保持：合格 |
| C Paper-only van de Vusse | Gabapentin vs Placeboが先頭、sequenceは詳細：合格 |
| D Global perceived pain relief | 20/46・8/46を主表示、20/46→p.7 Table 3黄色表示：合格 |
| E Crossover | paired解析の注意、独立2群CSVの防止：合格 |
| F Continuous | baseline／post／changeと時点切替、SD／SE／CI区別：合格 |
| G SE | 「SDではない」を明示し、Raw SEを保持：合格 |
| H HR | HR＋CI保持、log(HR)＋SE提案、明示採用後GIV出力：合格 |
| I Edit | 動作確認用6.3→6.4はFinalだけ更新、Raw 6.3・出典・履歴保持：合格 |
| J Accept | 選択したResult setだけ即保存、Outcome／Study確定を別途要求しない：合格 |
| K Basket | 採用件数・Study／Comparison／Outcome／Time／Data一覧へ即反映：合格 |
| L CSV copy | 実クリップボードと全文preview一致、TSV・fallback・実CSV保存：合格 |
| M New paper | ICO保持／クリア、PDF候補解除、採用済みWorkspace保持、保存先継続：合格 |

## テスト件数

| 範囲 | 合格 |
|---|---:|
| 既存一括回帰（Phase 2〜3.2.2、Prompt Builder、Fuzzy） | 155/155 |
| 既存Resultモデル／実ブラウザ | 20/20 + 19/19 |
| 既存Decisionモデル／実ブラウザ | 23/23 + 20/20 |
| 既存Final review | 21/21 |
| 新規Paperモデル | 56/56 |
| 新規Result set／basket単体 | 24/24 |
| 新規Paper実ブラウザ | 13/13 |
| 新規basket・編集・CSV・Derived実ブラウザ | 17/17 |
| **合計** | **368/368（既存258＋追加110）** |

既存テストの画面操作は、ICOの折りたたみ・新しい表示構造に合わせて更新しました。Phase 3.1のzoom後ハイライト確認は描画完了を待つように修正。既存の原著照合・保存・PDF操作の検証は維持しています。

Cherkinの実測値クリックは `6.3 (5.7)`、`8.9 (6.0)` がp.21 Table 2のそれぞれのcell、RolandタイトルがRoland block、`-2.63 [-3.69, -1.56]` がp.22 Table 3、responderがp.17 Figure 4へ一致。PDF検索・手動黄色ハイライト・図表選択・caption・zoomも合格しています。

検証はAIによる再抽出精度評価ではありません。Cherkinは固定済みRaw 163件、van de Vusseの自動ブラウザ回帰は原著に出典を持つ4行のfixtureを使用。SE／CI／HRは独立した合成fixtureです。実際の内蔵ブラウザでも、保存済みvan de Vusse全Raw 191件を新版で開き、原著PDFを接続して20/46→Table 3を確認しました。テスト用の6.4やHR fixtureは利用中のレビューへ登録していません。

## 証跡と実ファイル

証跡ルート：`C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-Paper-v5/`

- `final-verification.json`：合格件数、Coreハッシュ、ブランチ確認。
- `dataex-regression.test.cjs/suite-result.json`：既存155件。
- `dataex-results.browser.test.cjs/acceptance-A-H.json`：Cherkinのcell／block／Figure位置と画面証跡。
- `dataex-paper.browser.test.cjs/acceptance-v5.json`：Paper-only、crossover、3層、Clear、New paper。
- `dataex-paper-basket.browser.test.cjs/v5-basket-acceptance.json`：編集・採用・コピー・保存・Derived。
- `dataex-paper-basket.browser.test.cjs/Review Workspace_accepted_master.csv`：実ダウンロードした全文CSV（動作確認用Final 6.4を含む）。
- `dataex-paper-basket.browser.test.cjs/Review Workspace_accepted_giv.csv`：合成HRから明示採用したlog(HR)＋SE。
- 各実ブラウザテストフォルダにPNG。過去の失敗試行がある場合は`earlier-attempt`に分離してあり、最終結果とは別です。

## 変更ファイル

| 種別 | ファイル |
|---|---|
| 初期画面／復帰 | `dataex-chatgpt.html`, `dataex-fuzzy-workspace.js`, `dataex-fuzzy.css`, `dataex-webmcp.js` |
| 比較・統計・Result表示 | `dataex-paper-model.js`（新規）, `dataex-paper.css`（新規）, `dataex-results-ui.js` |
| Final／basket／CSV | `dataex-decisions.js`, `dataex-review-workspace.js`, `dataex-review.css` |
| 新規テスト | `dataex-paper-model.test.cjs`, `dataex-paper-decisions.test.cjs`, `dataex-paper.browser.test.cjs`, `dataex-paper-basket.browser.test.cjs` |
| 既存テストのUI適応 | `dataex-fuzzy.browser.test.cjs`, `dataex-decisions.browser.test.cjs`, `dataex-results.browser.test.cjs`, `dataex-phase31.browser.test.cjs` |
| 方針・報告 | `AGENTS.md`, `DATAEX_UX_V5.md`, 本報告書 |

## 起動・保全・既知の制限

- URL：`http://127.0.0.1:8766/dataex-chatgpt.html`。既存の`start-dataex.ps1`を使用。新サーバー方式は追加していません。
- 作業ブランチ：`dataex-chatgpt-phase1`。HEAD：`980fec695ad42bad05ed715c73b73571b7c749a3`。main：`f355b304970fe233c6c001ac2184e8d40a5466f2`。commit・merge・pushは行っていません。
- Fuzzy Core 2ファイルのSHA-256は開始時と一致。Raw、SourceAnchor、黄色ハイライトの照合アルゴリズムを保持しています。
- ブラウザ／アプリ終了時にPDFのメモリ上の接続は失われます。保存済みReviewを開き、同じPDFを再接続すれば確認操作を続けられます。今回の再開時も既存スクリプトで8766を起動し、この方法でRaw 191件とPDFを復帰しました。
- Paper-onlyは既存のChatGPT／CodexによるFuzzy抽出フローで動作します。アプリ独自のAI API接続、APIキー欄、PDF自動外部送信は追加していません。
- 統計の種類やstudy designの元metadataが誤っていれば人間の原著確認が必要です。候補の使用可否表示は採用操作を代行しません。paired variance・中央値換算・群統合の不足情報を自動補完しません。
