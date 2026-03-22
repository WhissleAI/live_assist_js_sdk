import React, { useState, useCallback } from "react";
import type { StructuredMenu, MenuCategory, MenuItem } from "./lib/documents";
import type { UploadedDocument } from "./lib/documents";

interface Props {
  document: UploadedDocument;
  onConfirm: (updatedDoc: UploadedDocument) => void;
  onBack: () => void;
}

function formatPrice(p: number | null | undefined): string {
  return p != null ? `$${p.toFixed(2)}` : "—";
}

function parsePriceInput(v: string): number | null {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function rebuildMenuText(menu: StructuredMenu): string {
  const lines: string[] = [];
  if (menu.restaurant_name) lines.push(`# ${menu.restaurant_name} Menu\n`);
  for (const cat of menu.categories) {
    lines.push(`## ${cat.name}`);
    for (const item of cat.items) {
      let price = "";
      if (item.prices.default != null) {
        price = ` — $${item.prices.default.toFixed(2)}`;
      } else {
        const sizes = [];
        if (item.prices.small != null) sizes.push(`S: $${item.prices.small.toFixed(2)}`);
        if (item.prices.medium != null) sizes.push(`M: $${item.prices.medium.toFixed(2)}`);
        if (item.prices.large != null) sizes.push(`L: $${item.prices.large.toFixed(2)}`);
        if (item.prices.extra_large != null) sizes.push(`XL: $${item.prices.extra_large.toFixed(2)}`);
        if (sizes.length) price = ` — ${sizes.join(", ")}`;
      }
      const desc = item.description ? ` (${item.description})` : "";
      lines.push(`- ${item.name}${price}${desc}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export default function MenuReview({ document, onConfirm, onBack }: Props) {
  const [menu, setMenu] = useState<StructuredMenu>(() => {
    if (document.menu) return JSON.parse(JSON.stringify(document.menu));
    return { restaurant_name: null, categories: [] };
  });

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState(menu.restaurant_name || "");

  const totalItems = menu.categories.reduce((sum, c) => sum + c.items.length, 0);

  const updateCategory = useCallback((catIdx: number, updates: Partial<MenuCategory>) => {
    setMenu((prev) => {
      const cats = [...prev.categories];
      cats[catIdx] = { ...cats[catIdx], ...updates };
      return { ...prev, categories: cats };
    });
  }, []);

  const updateItem = useCallback((catIdx: number, itemIdx: number, updates: Partial<MenuItem>) => {
    setMenu((prev) => {
      const cats = [...prev.categories];
      const items = [...cats[catIdx].items];
      items[itemIdx] = { ...items[itemIdx], ...updates };
      cats[catIdx] = { ...cats[catIdx], items };
      return { ...prev, categories: cats };
    });
  }, []);

  const removeItem = useCallback((catIdx: number, itemIdx: number) => {
    setMenu((prev) => {
      const cats = [...prev.categories];
      const items = [...cats[catIdx].items];
      items.splice(itemIdx, 1);
      if (items.length === 0) {
        cats.splice(catIdx, 1);
      } else {
        cats[catIdx] = { ...cats[catIdx], items };
      }
      return { ...prev, categories: cats };
    });
  }, []);

  const removeCategory = useCallback((catIdx: number) => {
    setMenu((prev) => {
      const cats = [...prev.categories];
      cats.splice(catIdx, 1);
      return { ...prev, categories: cats };
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const finalMenu = { ...menu, restaurant_name: restaurantName || null };
    const updatedDoc: UploadedDocument = {
      ...document,
      content: rebuildMenuText(finalMenu),
      menu: finalMenu,
    };
    onConfirm(updatedDoc);
  }, [menu, restaurantName, document, onConfirm]);

  const hasSizedPricing = (item: MenuItem) =>
    item.prices.small != null || item.prices.medium != null ||
    item.prices.large != null || item.prices.extra_large != null;

  return (
    <div className="menu-review-root">
      <div className="menu-review-container">
        <div className="menu-review-header">
          <button type="button" className="menu-review-back" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>
          <div className="menu-review-header-text">
            <h1>Review Your Menu</h1>
            <p>Verify the extracted menu below. Edit names, prices, or remove items before starting the kiosk.</p>
          </div>
        </div>

        <div className="menu-review-stats">
          <div className="menu-review-stat">
            <span className="menu-review-stat-value">{menu.categories.length}</span>
            <span className="menu-review-stat-label">Categories</span>
          </div>
          <div className="menu-review-stat">
            <span className="menu-review-stat-value">{totalItems}</span>
            <span className="menu-review-stat-label">Items</span>
          </div>
          <div className="menu-review-stat">
            <span className="menu-review-stat-value">
              {menu.categories.reduce((s, c) => s + c.items.filter((i) => i.prices.default != null || hasSizedPricing(i)).length, 0)}
            </span>
            <span className="menu-review-stat-label">With Prices</span>
          </div>
        </div>

        <div className="menu-review-name-section">
          <label className="menu-review-name-label">Restaurant Name</label>
          <input
            className="menu-review-name-input"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="Enter restaurant name..."
          />
        </div>

        <div className="menu-review-categories">
          {menu.categories.map((cat, catIdx) => (
            <div key={catIdx} className="menu-review-category">
              <div className="menu-review-category-header">
                <input
                  className="menu-review-category-name"
                  value={cat.name}
                  onChange={(e) => updateCategory(catIdx, { name: e.target.value })}
                />
                <span className="menu-review-category-count">{cat.items.length} items</span>
                <button
                  type="button"
                  className="menu-review-remove-btn"
                  title="Remove category"
                  onClick={() => removeCategory(catIdx)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>

              <div className="menu-review-items">
                {cat.items.map((item, itemIdx) => {
                  const itemKey = `${catIdx}-${itemIdx}`;
                  const isEditing = editingItem === itemKey;
                  const sized = hasSizedPricing(item);

                  return (
                    <div key={itemIdx} className={`menu-review-item ${isEditing ? "menu-review-item--editing" : ""}`}>
                      <div className="menu-review-item-main" onClick={() => setEditingItem(isEditing ? null : itemKey)}>
                        <div className="menu-review-item-info">
                          <span className="menu-review-item-name">{item.name}</span>
                          {item.description && <span className="menu-review-item-desc">{item.description}</span>}
                        </div>
                        <div className="menu-review-item-price">
                          {sized ? (
                            <span className="menu-review-item-price-range">
                              {[item.prices.small, item.prices.medium, item.prices.large, item.prices.extra_large]
                                .filter((p) => p != null)
                                .map((p) => `$${p!.toFixed(2)}`)
                                .join(" – ")}
                            </span>
                          ) : (
                            <span>{formatPrice(item.prices.default)}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="menu-review-item-toggle"
                          onClick={(e) => { e.stopPropagation(); setEditingItem(isEditing ? null : itemKey); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {isEditing
                              ? <polyline points="18 15 12 9 6 15" />
                              : <polyline points="6 9 12 15 18 9" />}
                          </svg>
                        </button>
                      </div>

                      {isEditing && (
                        <div className="menu-review-item-edit">
                          <div className="menu-review-edit-row">
                            <label>Name</label>
                            <input
                              value={item.name}
                              onChange={(e) => updateItem(catIdx, itemIdx, { name: e.target.value })}
                            />
                          </div>
                          <div className="menu-review-edit-row">
                            <label>Description</label>
                            <input
                              value={item.description || ""}
                              onChange={(e) => updateItem(catIdx, itemIdx, { description: e.target.value || null })}
                              placeholder="Optional description..."
                            />
                          </div>
                          {sized ? (
                            <div className="menu-review-edit-prices">
                              <label>Prices by size</label>
                              <div className="menu-review-price-grid">
                                {(["small", "medium", "large", "extra_large"] as const).map((sz) => (
                                  <div key={sz} className="menu-review-price-field">
                                    <span className="menu-review-price-size">{sz === "extra_large" ? "XL" : sz.charAt(0).toUpperCase()}</span>
                                    <input
                                      type="text"
                                      value={item.prices[sz] != null ? item.prices[sz]!.toString() : ""}
                                      onChange={(e) => updateItem(catIdx, itemIdx, {
                                        prices: { ...item.prices, [sz]: parsePriceInput(e.target.value) },
                                      })}
                                      placeholder="—"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="menu-review-edit-row">
                              <label>Price</label>
                              <input
                                type="text"
                                value={item.prices.default != null ? item.prices.default.toString() : ""}
                                onChange={(e) => updateItem(catIdx, itemIdx, {
                                  prices: { ...item.prices, default: parsePriceInput(e.target.value) },
                                })}
                                placeholder="0.00"
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            className="menu-review-remove-item"
                            onClick={() => { removeItem(catIdx, itemIdx); setEditingItem(null); }}
                          >
                            Remove Item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {menu.categories.length === 0 && (
          <div className="menu-review-empty">
            No menu items extracted. Go back and try uploading a different file.
          </div>
        )}

        <div className="menu-review-actions">
          <button type="button" className="menu-review-confirm-btn" onClick={handleConfirm} disabled={totalItems === 0}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            Start Kiosk with {totalItems} Items
          </button>
        </div>
      </div>
    </div>
  );
}
