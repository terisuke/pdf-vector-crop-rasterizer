# 修正要求書：Diffusionモデル学習用データ統合機能の追加

## 1. 背景と問題点

### 現在の問題
現在のPhase 2 (elements.json) 出力には、Diffusionモデルの学習に必要な以下の重要なメタデータが欠落しています：

- `layout_bounds` / `grid_dimensions`（グリッドサイズ）
- `grid_px`（ピクセル単位のグリッドサイズ）
- `grid_mm`（実寸法でのグリッドサイズ）
- `floor`（階数情報）
- `scale_info`（図面縮尺情報）

これらの情報がないと、Diffusionモデルは以下の重要な条件付けを学習できません：
- 特定のグリッドサイズ（6x10など）での間取り生成
- 階数に応じた要素配置の制約（1Fには入口必須、2F以上には入口不可など）
- 実寸法を考慮した適切なスケールでの生成

## 2. 修正内容

### 2.1 App.tsx の修正

#### 2.1.1 新しいState変数の追加
```typescript
// 既存のstateの後に追加
const [exportIntegratedJson, setExportIntegratedJson] = useState<boolean>(true); // デフォルトでON
```

#### 2.1.2 handleProcessAndSave関数の修正
Phase 2処理部分（`if (cropSessionId && phase1Metadata) {`ブロック内）の最後に、統合JSON出力処理を追加してください。

以下のコードを、既存のPhase 2 JSONダウンロード処理の後に追加：

```typescript
// 統合JSONの出力（新機能）
if (exportIntegratedJson) {
  // Phase 1とPhase 2のデータを統合
  const integratedData = {
    // === メタデータセクション (Phase 1から) ===
    crop_id: phase1Metadata.crop_id,
    original_pdf: phase1Metadata.original_pdf,
    floor: phase1Metadata.floor,
    
    // グリッドとスケール情報（学習に必須）
    grid_dimensions: phase1Metadata.grid_dimensions,
    scale_info: phase1Metadata.scale_info,
    
    // 建物コンテキスト
    building_context: phase1Metadata.building_context,
    grid_module_info: phase1Metadata.grid_module_info,
    
    // 切り抜き情報
    crop_bounds_in_original: phase1Metadata.crop_bounds_in_original,
    
    // === 要素配置セクション (Phase 2から) ===
    structural_elements: phase2Elements.structural_elements,
    zones: phase2Elements.zones,
    stair_info: phase2Elements.stair_info,
    
    // === 統合メタデータ ===
    element_summary: elementSummary,
    validation_status: phase2Elements.validation_status,
    
    // タイムスタンプ
    timestamps: {
      phase1_created: phase1Metadata.timestamp,
      phase2_created: phase2Elements.annotation_metadata.annotation_time,
      integrated_created: new Date().toISOString()
    },
    
    // バージョン情報
    metadata_version: "integrated_v1.0",
    annotation_metadata: {
      ...phase2Elements.annotation_metadata,
      floor_type: currentFloorLevel,
      grid_resolution: `${phase1Metadata.grid_dimensions.width_grids}x${phase1Metadata.grid_dimensions.height_grids}`,
      drawing_scale: phase1Metadata.scale_info.drawing_scale
    },
    
    // 学習用の追加情報
    training_hints: {
      total_area_grids: phase1Metadata.grid_dimensions.width_grids * phase1Metadata.grid_dimensions.height_grids,
      room_count: calculateRoomCount(phase2Elements.structural_elements),
      has_entrance: phase2Elements.structural_elements.some(el => el.type === 'entrance'),
      has_stair: phase2Elements.structural_elements.some(el => el.type === 'stair'),
      has_balcony: phase2Elements.structural_elements.some(el => el.type === 'balcony'),
      floor_constraints: getFloorRequirements(phase1Metadata.floor)
    }
  };
  
  // 統合JSONのダウンロード
  const integratedJsonString = JSON.stringify(integratedData, null, 2);
  const integratedJsonBlob = new Blob([integratedJsonString], { type: 'application/json' });
  const integratedJsonUrl = URL.createObjectURL(integratedJsonBlob);
  const integratedFileName = `plan_${pdfBaseName}_${currentFloorLevel.toLowerCase()}_integrated.json`;
  downloadDataUrl(integratedJsonUrl, integratedFileName);
  
  // LocalStorageにも保存（オプション）
  localStorage.setItem(`integrated_${cropSessionId}`, JSON.stringify(integratedData));
  
  setStatusMessage(
    `Phase 2: Saved ${currentOutputPngFilename}, element JSON, and integrated training JSON. ${validationResult.message}`
  );
} else {
  setStatusMessage(
    `Phase 2: Saved ${currentOutputPngFilename} and element placement JSON. ${validationResult.message}`
  );
}
```

#### 2.1.3 ヘルパー関数の追加
App.tsxの最後（export defaultの前）に以下の関数を追加：

```typescript
const calculateRoomCount = (elements: StructuralElement[]): number => {
  // 簡易的な部屋数推定（実際の実装では壁の配置から推定）
  const hasLivingArea = true; // 常にLDKがあると仮定
  const bedroomCount = Math.floor(elements.filter(el => el.type === 'balcony').length * 1.5); // バルコニー数から推定
  const bathroomCount = 1; // 最低1つ
  
  return 1 + bedroomCount + bathroomCount; // LDK + 寝室 + 浴室
};
```

### 2.2 ControlPanel.tsx の修正

#### 2.2.1 Props interfaceの拡張
ControlPanelPropsに以下を追加：

```typescript
interface ControlPanelProps {
  // ... 既存のprops
  exportIntegratedJson: boolean;
  onExportIntegratedJsonChange: (value: boolean) => void;
}
```

#### 2.2.2 UIコンポーネントの追加
Export Formatセクションの近く（または適切な場所）に以下のチェックボックスを追加：

```tsx
<div className="flex items-center space-x-2">
  <input
    type="checkbox"
    id="export-integrated"
    checked={exportIntegratedJson}
    onChange={(e) => onExportIntegratedJsonChange(e.target.checked)}
    className="rounded border-gray-600 bg-gray-700 text-sky-400 focus:ring-sky-400"
  />
  <label htmlFor="export-integrated" className="text-sm text-gray-300">
    Export Integrated JSON for Training
  </label>
</div>
```

### 2.3 App.tsx でControlPanelへのprops追加

ControlPanelコンポーネントの呼び出し部分に、新しいpropsを追加：

```tsx
<ControlPanel
  // ... 既存のprops
  exportIntegratedJson={exportIntegratedJson}
  onExportIntegratedJsonChange={setExportIntegratedJson}
/>
```

## 3. 出力ファイル形式

### 3.1 統合JSONファイル名
```
plan_{document_id}_{floor}_integrated.json
```
例：`plan_document_1f_integrated.json`

### 3.2 統合JSONファイルの構造
```json
{
  // Phase 1のメタデータ
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
  
  // Phase 2の要素データ
  "structural_elements": [...],
  "zones": [...],
  "stair_info": [...],
  
  // 統合メタデータ
  "element_summary": {...},
  "validation_status": {...},
  "timestamps": {
    "phase1_created": "...",
    "phase2_created": "...",
    "integrated_created": "..."
  },
  
  // 学習用ヒント
  "training_hints": {
    "total_area_grids": 60,
    "room_count": 4,
    "has_entrance": true,
    "has_stair": true,
    "has_balcony": false
  }
}
```

## 4. 実装の優先度と影響

### 優先度：高
この修正により、Diffusionモデルの学習において以下が可能になります：
- グリッドサイズ別の条件付き生成（"6x10グリッドの間取りを生成"）
- 階数別の制約を考慮した生成（"2階の間取りを生成（入口なし）"）
- 実寸法を意識した適切なスケールでの生成

### 後方互換性
- 既存のPhase 1/Phase 2分離出力は維持されます
- 統合JSON出力はオプション機能として実装されます（デフォルトON）
- 既存のワークフローに影響を与えません

## 5. テスト項目

1. 統合JSONファイルが正しく出力されること
2. Phase 1とPhase 2の全ての必要な情報が含まれていること
3. チェックボックスのON/OFFで出力が制御できること
4. 既存のPhase 1/Phase 2出力が影響を受けないこと
5. LocalStorageへの保存が正しく動作すること

## 6. 参考資料

### Diffusionモデルでの使用例
統合されたメタデータにより、以下のような詳細な条件付けプロンプトが生成可能になります：

```
"grid_6x10, area_60grids, scale_1:100, module_910mm, floor_1F, entrance_1, stair_1, rooms_4, japanese_house, architectural_plan"
```

これにより、モデルは特定の条件下での間取り生成を学習し、推論時により制御可能な生成が可能になります。