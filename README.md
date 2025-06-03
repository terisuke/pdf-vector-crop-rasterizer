# PDF Vector Crop & Rasterizer

PDFファイルから特定の領域を切り抜き、高解像度のラスター画像（PNG）に変換するWebアプリケーションです。建築図面の処理に特化し、構造要素（階段、エントランス、バルコニー）のアノテーション機能を提供します。

## 最新の更新（2025年6月）

- **座標計算の修正**: 切り抜き領域内での正確なグリッド座標計算を実装
- **2フェーズJSON出力**: 切り抜き情報と要素配置を分離した出力システム
- **セッション管理**: LocalStorageを使用した作業状態の保存・復元機能
- **デバッグログの削減**: 本番環境向けのログ最適化

## 機能概要

### 主要機能
- **PDF読み込み・表示**: 複数ページのPDFファイルの読み込みとページ間のナビゲーション
- **領域選択**: マウスドラッグによる切り抜き領域の視覚的な選択
- **高解像度出力**: カスタマイズ可能なDPI設定（72-600 DPI）での画像出力
- **グリッドシステム**: 実寸法に基づいた910mmグリッドセルの自動計算
- **構造要素の配置**: 階段、エントランス、バルコニーの配置とアノテーション
- **メタデータ出力**: レイアウト情報を含むJSONファイルの同時出力
- **グレースケール変換**: AI学習用に最適化された画像変換機能
- **2フェーズシステム**: 切り抜き（Phase 1）と要素配置（Phase 2）の分離

### 技術的特徴
- React 19.1.0 + TypeScriptによる型安全な実装
- PDF.js（pdfjs-dist）によるPDFレンダリング
- Viteによる高速な開発環境
- レスポンシブなUIデザイン（Tailwind CSS）

## インストールと実行

### 前提条件
- Node.js (v16以上推奨)
- npm または yarn

### セットアップ手順

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **環境変数の設定**
   `.env.local`ファイルにGemini APIキーを設定：
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
   注：現在のバージョンではGemini APIは使用していませんが、将来の拡張のため設定が必要です。

3. **開発サーバーの起動**
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:5173` にアクセスしてください。

### その他のコマンド
```bash
npm run build    # プロダクションビルド
npm run preview  # ビルド結果のプレビュー
npm run lint     # TypeScriptの型チェック
```

## デプロイメント

### Vercel（推奨）

1. **Vercelアカウントの準備**
   - [Vercel](https://vercel.com)でアカウントを作成
   - GitHubリポジトリと連携

2. **環境変数の設定**
   - Vercelダッシュボードの Settings > Environment Variables で設定：
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **デプロイ**
   ```bash
   npm run build  # ローカルでビルドテスト
   ```
   - GitHubにプッシュすると自動デプロイ
   - または`vercel`コマンドでマニュアルデプロイ

### GitHub Pages（代替案）

1. **ビルド設定**
   - `package.json`にhomepageフィールドを追加
   - `vite.config.ts`でbase pathを設定

2. **デプロイ**
   ```bash
   npm run build
   # distフォルダをgh-pagesブランチにプッシュ
   ```

注：GitHub Pagesでは環境変数の管理が制限されるため、Vercelを推奨します。

## 使用方法

### 基本的なワークフロー

1. **PDFファイルの読み込み**
   - 「Select PDF File」ボタンからPDFファイルを選択
   - ファイル名から階数（1F/2F）が自動認識されます

2. **切り抜き領域の選択**
   - PDFビューア上でマウスドラッグして領域を選択
   - 選択した領域に基づいてグリッドが自動計算されます

3. **設定の調整**
   - **DPI**: 出力画像の解像度（デフォルト: 300）
   - **Drawing Scale**: 図面の縮尺（1:100など）
   - **Floor**: 階数の選択（1F/2F）

4. **構造要素の配置**
   - キーボードショートカットまたはボタンで配置モードを選択
     - `1`: 階段
     - `2`: エントランス
     - `3`: バルコニー
     - `Esc`: キャンセル
   - グリッド上をクリックまたはドラッグして配置

5. **エクスポート**
   - 「Process and Save」ボタンで画像とメタデータを出力
   - 出力ファイル名: `plan_{document_id}_{floor}.png/json`

### バリデーションルール
- **1F**: 少なくとも1つのエントランスが必要
- **2F以上**: 少なくとも1つの階段が必要、エントランスは配置不可

## アーキテクチャ

### コンポーネント構成

```
src/
├── App.tsx                 # メインアプリケーションコンポーネント
├── components/
│   ├── ControlPanel.tsx    # UIコントロールパネル
│   ├── PdfViewer.tsx       # PDFビューアとインタラクション
│   └── SessionModal.tsx    # セッション管理モーダル
├── types.ts               # TypeScript型定義
├── utils/
│   ├── pdfCropper.ts      # PDF切り抜き処理（メイン）
│   ├── pdfCropperSimple.ts # PDF切り抜き処理（フォールバック）
│   └── logger.ts          # デバッグログユーティリティ
└── index.tsx              # エントリーポイント
```

### 主要な型定義

```typescript
// 切り抜き領域（PDF座標系）
interface PdfPointCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

// グリッド寸法
interface GridDimensions {
  width_grids: number;
  height_grids: number;
}

// 構造要素
interface StructuralElement {
  type: 'stair' | 'entrance' | 'balcony';
  grid_x: number;
  grid_y: number;
  grid_width?: number;
  grid_height?: number;
  name?: string;
}
```

### 座標系の変換

アプリケーションは3つの座標系を扱います：

1. **PDF座標系**: PDF仕様に基づく座標（1pt = 1/72インチ）
2. **Canvas座標系**: 画面表示用のピクセル座標
3. **グリッド座標系**: 実世界の寸法に基づく論理座標（1グリッド = 910mm）

## 出力形式

### PNG画像
- 選択した領域を指定されたDPIで出力
- ファイル名: `plan_{document_id}_{floor}.png`

### JSONメタデータ

#### Phase 1 メタデータ（切り抜き時に生成）
```json
{
  "crop_id": "document_1f",
  "original_pdf": "document.pdf",
  "floor": "1F",
  "grid_dimensions": {
    "width_grids": 6,
    "height_grids": 10
  },
  "scale_info": {
    "drawing_scale": "1:100",
    "grid_mm": 910,
    "grid_px": 108.0
  },
  "crop_bounds_in_original": {
    "x": 165.5,
    "y": 52,
    "width": 158,
    "height": 263
  }
}
```

#### Phase 2 要素配置データ（エクスポート時に生成）
```json
{
  "crop_id": "document_1f",
  "structural_elements": [
    {
      "type": "stair",
      "grid_x": 0.3,
      "grid_y": 3.6,
      "grid_width": 1.6,
      "grid_height": 1.3,
      "name": "stair_1"
    },
    {
      "type": "entrance",
      "grid_x": 3.8,
      "grid_y": 8.2,
      "grid_width": 2.2,
      "grid_height": 1.4,
      "name": "entrance_2"
    }
  ],
  "validation_status": {
    "passed": true,
    "messages": ["✅ Annotated: 1 stair(s), 1 entrance(s), 0 balcony(s)."]
  }
}
```

## 開発者向け情報

### 技術的な詳細

#### 座標系の精度
- グリッド座標は小数点第1位まで保持（0.1グリッド単位の精度）
- 切り抜き領域内での相対座標として計算
- エクスポート時の座標変換は元のPDF座標系を保持

#### セッション管理
- LocalStorageにPhase 1とPhase 2のデータを分離して保存
- セッションIDは`{document_name}_{floor}`形式で自動生成
- 「Load Session」ボタンから過去の作業を復元可能

### 無効化された機能
- 壁描画機能は現在無効化されています（コードは残存していますが、UIからアクセスできません）

### 今後の拡張予定
- 壁要素の再実装
- より詳細なゾーニング機能
- エクスポート形式の追加（SVG、DXFなど）
- Gemini APIを使用した自動認識機能

## トラブルシューティング

### よくある問題

1. **PDF.jsワーカーエラー**
   - ブラウザが最新のJavaScriptをサポートしていることを確認
   - esm.shへのアクセスがブロックされていないか確認

2. **切り抜き領域が選択できない**
   - PDFが正しく読み込まれているか確認
   - ビューのズームレベルをリセット（Reset Zoomボタン）

3. **エクスポートが失敗する**
   - バリデーションエラーメッセージを確認
   - 必要な構造要素が配置されているか確認

## ライセンス

このプロジェクトは社内利用を目的としています。詳細なライセンス情報については管理者にお問い合わせください。
