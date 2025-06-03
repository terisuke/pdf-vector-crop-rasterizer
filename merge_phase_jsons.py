#!/usr/bin/env python3
"""
merge_phase_jsons.py
Phase 1とPhase 2のJSONファイルを統合して、Diffusion学習用の完全なデータセットを作成

使用方法:
    python merge_phase_jsons.py /path/to/json/files -o /path/to/output --add-prompts
    
    引数:
        input_dir: Phase 1とPhase 2のJSONファイルが格納されているディレクトリ
        -o, --output_dir: 統合JSONファイルの出力先ディレクトリ（省略時は input_dir/integrated）
        --add-prompts: 学習用プロンプトをJSONに追加
        --dry-run: 実際のファイル作成を行わずに処理内容を確認
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import argparse
from datetime import datetime


def find_json_pairs(directory: Path) -> List[Tuple[Path, Path]]:
    """
    ディレクトリから Phase 1 (_metadata.json) と Phase 2 (_elements.json) のペアを探す
    """
    pairs = []
    
    # Phase 1ファイルを探す
    phase1_files = list(directory.glob("*_metadata.json"))
    
    for phase1_file in phase1_files:
        # 対応するPhase 2ファイルを探す
        base_name = phase1_file.stem.replace("_metadata", "")
        phase2_file = directory / f"{base_name}_elements.json"
        
        if phase2_file.exists():
            pairs.append((phase1_file, phase2_file))
            print(f"Found pair: {phase1_file.name} <-> {phase2_file.name}")
        else:
            print(f"Warning: No corresponding Phase 2 file for {phase1_file.name}")
    
    return pairs


def merge_json_files(phase1_path: Path, phase2_path: Path) -> Dict:
    """
    Phase 1とPhase 2のJSONファイルを統合
    """
    # ファイルを読み込む
    with open(phase1_path, 'r', encoding='utf-8') as f:
        phase1_data = json.load(f)
    
    with open(phase2_path, 'r', encoding='utf-8') as f:
        phase2_data = json.load(f)
    
    # 統合データの作成
    integrated_data = {
        # === メタデータセクション (Phase 1から) ===
        'crop_id': phase1_data.get('crop_id'),
        'original_pdf': phase1_data.get('original_pdf'),
        'floor': phase1_data.get('floor'),
        
        # グリッドとスケール情報（学習に必須）
        'grid_dimensions': phase1_data.get('grid_dimensions'),
        'scale_info': phase1_data.get('scale_info'),
        
        # 建物コンテキスト（存在する場合）
        'building_context': phase1_data.get('building_context'),
        'grid_module_info': phase1_data.get('grid_module_info'),
        
        # 切り抜き情報
        'crop_bounds_in_original': phase1_data.get('crop_bounds_in_original'),
        
        # 構造制約（存在する場合）
        'structural_constraints': phase1_data.get('structural_constraints'),
        'floor_requirements': phase1_data.get('floor_requirements'),
        
        # === 要素配置セクション (Phase 2から) ===
        'structural_elements': phase2_data.get('structural_elements', []),
        'zones': phase2_data.get('zones', []),
        'stair_info': phase2_data.get('stair_info', []),
        
        # === 統合メタデータ ===
        'validation_status': phase2_data.get('validation_status'),
        
        # タイムスタンプ
        'timestamps': {
            'phase1_created': phase1_data.get('timestamp'),
            'phase2_created': phase2_data.get('annotation_metadata', {}).get('annotation_time'),
            'integrated_created': datetime.now().isoformat()
        },
        
        # バージョン情報
        'metadata_version': 'integrated_v1.0',
        'annotation_metadata': {
            **phase2_data.get('annotation_metadata', {}),
            'floor_type': phase1_data.get('floor'),
            'grid_resolution': f"{phase1_data.get('grid_dimensions', {}).get('width_grids')}x{phase1_data.get('grid_dimensions', {}).get('height_grids')}",
            'drawing_scale': phase1_data.get('scale_info', {}).get('drawing_scale')
        }
    }
    
    # 学習用の追加情報を計算
    integrated_data['training_hints'] = calculate_training_hints(integrated_data)
    
    return integrated_data


def calculate_training_hints(data: Dict) -> Dict:
    """
    学習に有用な追加情報を計算
    """
    grid_dims = data.get('grid_dimensions', {})
    elements = data.get('structural_elements', [])
    
    hints = {
        'total_area_grids': grid_dims.get('width_grids', 0) * grid_dims.get('height_grids', 0),
        'has_entrance': any(el.get('type') == 'entrance' for el in elements),
        'has_stair': any(el.get('type') == 'stair' for el in elements),
        'has_balcony': any(el.get('type') == 'balcony' for el in elements),
        'element_counts': {}
    }
    
    # 要素タイプごとのカウント
    for element in elements:
        elem_type = element.get('type', 'unknown')
        hints['element_counts'][elem_type] = hints['element_counts'].get(elem_type, 0) + 1
    
    # 部屋数の推定（簡易版）
    hints['estimated_room_count'] = estimate_room_count(elements, grid_dims)
    
    return hints


def estimate_room_count(elements: List[Dict], grid_dims: Dict) -> int:
    """
    要素配置から部屋数を推定（簡易版）
    """
    # 基本的な推定ロジック
    base_rooms = 1  # LDK
    
    # バルコニーの数から寝室数を推定
    balcony_count = sum(1 for el in elements if el.get('type') == 'balcony')
    bedroom_estimate = max(1, balcony_count)
    
    # グリッドサイズから全体的な規模を推定
    total_grids = grid_dims.get('width_grids', 6) * grid_dims.get('height_grids', 10)
    if total_grids > 80:
        bedroom_estimate += 1
    
    # 浴室・トイレは最低1つ
    wet_areas = 1
    
    return base_rooms + bedroom_estimate + wet_areas


def save_integrated_json(integrated_data: Dict, output_path: Path):
    """
    統合JSONファイルを保存
    """
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(integrated_data, f, ensure_ascii=False, indent=2)
    print(f"Saved integrated JSON: {output_path}")


def generate_training_prompt(integrated_data: Dict) -> str:
    """
    統合データから学習用プロンプトを生成
    """
    parts = []
    
    # グリッドサイズ
    grid_dims = integrated_data.get('grid_dimensions', {})
    if grid_dims:
        parts.append(f"grid_{grid_dims.get('width_grids')}x{grid_dims.get('height_grids')}")
    
    # 階数
    floor = integrated_data.get('floor')
    if floor:
        parts.append(f"floor_{floor}")
    
    # スケール情報
    scale_info = integrated_data.get('scale_info', {})
    if scale_info:
        parts.append(f"scale_{scale_info.get('drawing_scale', '1:100')}")
        parts.append(f"module_{scale_info.get('grid_mm', 910)}mm")
    
    # 要素数
    hints = integrated_data.get('training_hints', {})
    element_counts = hints.get('element_counts', {})
    for elem_type, count in element_counts.items():
        parts.append(f"{elem_type}_{count}")
    
    # 推定部屋数
    room_count = hints.get('estimated_room_count', 0)
    if room_count > 0:
        parts.append(f"rooms_{room_count}")
    
    # 基本タグ
    parts.extend(['japanese_house', 'architectural_plan', '910mm_grid'])
    
    return ', '.join(parts)


def main():
    parser = argparse.ArgumentParser(description='Merge Phase 1 and Phase 2 JSON files for Diffusion training')
    parser.add_argument('input_dir', type=Path, help='Directory containing Phase 1 and Phase 2 JSON files')
    parser.add_argument('-o', '--output_dir', type=Path, help='Output directory for integrated JSON files')
    parser.add_argument('--add-prompts', action='store_true', help='Add generated prompts to the integrated JSON')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without actually merging')
    
    args = parser.parse_args()
    
    # 入力ディレクトリの確認
    if not args.input_dir.exists():
        print(f"Error: Input directory {args.input_dir} does not exist")
        sys.exit(1)
    
    # 出力ディレクトリの設定
    output_dir = args.output_dir or args.input_dir / 'integrated'
    if not args.dry_run and not output_dir.exists():
        output_dir.mkdir(parents=True)
        print(f"Created output directory: {output_dir}")
    
    # JSONペアを探す
    pairs = find_json_pairs(args.input_dir)
    
    if not pairs:
        print("No matching Phase 1 and Phase 2 pairs found")
        sys.exit(1)
    
    print(f"\nFound {len(pairs)} pairs to merge")
    
    # 各ペアを処理
    successful_merges = 0
    for phase1_path, phase2_path in pairs:
        try:
            print(f"\nMerging: {phase1_path.name} + {phase2_path.name}")
            
            if args.dry_run:
                print("  [DRY RUN] Would merge these files")
                continue
            
            # JSONファイルを統合
            integrated_data = merge_json_files(phase1_path, phase2_path)
            
            # プロンプトを追加（オプション）
            if args.add_prompts:
                integrated_data['generated_prompt'] = generate_training_prompt(integrated_data)
                print(f"  Generated prompt: {integrated_data['generated_prompt'][:50]}...")
            
            # 出力ファイル名を決定
            base_name = phase1_path.stem.replace('_metadata', '')
            output_path = output_dir / f"{base_name}_integrated.json"
            
            # 保存
            save_integrated_json(integrated_data, output_path)
            successful_merges += 1
            
        except Exception as e:
            print(f"  Error merging files: {e}")
            continue
    
    print(f"\nSuccessfully merged {successful_merges} out of {len(pairs)} pairs")
    
    if not args.dry_run and successful_merges > 0:
        print(f"Integrated JSON files saved to: {output_dir}")
        
        # サマリーファイルを作成
        summary = {
            'merge_timestamp': datetime.now().isoformat(),
            'input_directory': str(args.input_dir),
            'output_directory': str(output_dir),
            'total_pairs': len(pairs),
            'successful_merges': successful_merges,
            'merged_files': [p[0].stem.replace('_metadata', '') for p in pairs[:successful_merges]]
        }
        
        summary_path = output_dir / 'merge_summary.json'
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"Merge summary saved to: {summary_path}")


if __name__ == '__main__':
    main()
