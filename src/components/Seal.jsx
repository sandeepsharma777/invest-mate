import { PALETTE } from "../lib/chartConfig";

/** Matches .seal markup from components.css */
export function Seal({ assetType, label, ASSET_TYPES }) {
  const displayLabel = label || ASSET_TYPES?.[assetType]?.label || assetType;
  return (
    <span className={`seal seal--${assetType}`}>
      <i className="seal__dot" />
      {displayLabel}
    </span>
  );
}

/** Asset-type color dot used in quick-add buttons */
export function ColorDot({ assetType }) {
  return (
    <span
      className="seal__dot"
      style={{ background: PALETTE[assetType] || PALETTE.other }}
    />
  );
}
