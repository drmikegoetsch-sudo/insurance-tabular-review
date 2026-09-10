import { useMemo, useState } from "react";
import {
  applicableExtensions,
  buildColumns,
  listDomains,
  listTemplates,
} from "../index.js";
import type { CatalogExtension, CatalogTemplate, ReviewColumn } from "../types.js";

export interface TemplateSelection {
  template: CatalogTemplate;
  extensionIds: string[];
  includeOptional: boolean;
  /** The columns the review would be created with. */
  columns: ReviewColumn[];
}

export interface TemplatePickerProps {
  /** Called whenever the selection changes. `null` when no template is chosen. */
  onChange: (selection: TemplateSelection | null) => void;
  initialTemplateId?: string;
  /** Optional class names so the picker can adopt the host app's styles. */
  classNames?: Partial<Record<"root" | "list" | "group" | "item" | "itemSelected" | "detail" | "chips" | "chip", string>>;
}

/**
 * Headless-leaning template picker: a grouped list of templates, the
 * extensions that apply to the chosen one, and an "include all columns"
 * toggle. Emits the resolved column list so the host only has to POST it.
 * Styling is left to the host via `classNames`; the inline defaults are
 * minimal so the component reads correctly unstyled.
 */
export function TemplatePicker({ onChange, initialTemplateId, classNames = {} }: TemplatePickerProps) {
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId ?? null);
  const [extensionIds, setExtensionIds] = useState<string[]>([]);
  const [includeOptional, setIncludeOptional] = useState(false);

  const domains = useMemo(() => listDomains(), []);
  const template = useMemo(
    () => (templateId ? listTemplates().find((t) => t.id === templateId) ?? null : null),
    [templateId],
  );
  const extensions: CatalogExtension[] = useMemo(
    () => (template ? applicableExtensions(template.id) : []),
    [template],
  );

  function emit(next: { templateId: string | null; extensionIds: string[]; includeOptional: boolean }) {
    if (!next.templateId) return onChange(null);
    const chosen = listTemplates().find((t) => t.id === next.templateId);
    if (!chosen) return onChange(null);
    onChange({
      template: chosen,
      extensionIds: next.extensionIds,
      includeOptional: next.includeOptional,
      columns: buildColumns({
        templateId: chosen.id,
        extensionIds: next.extensionIds,
        includeOptional: next.includeOptional,
      }),
    });
  }

  function selectTemplate(id: string) {
    setTemplateId(id);
    setExtensionIds([]);
    setIncludeOptional(false);
    emit({ templateId: id, extensionIds: [], includeOptional: false });
  }

  function toggleExtension(id: string) {
    const next = extensionIds.includes(id) ? extensionIds.filter((x) => x !== id) : [...extensionIds, id];
    setExtensionIds(next);
    emit({ templateId, extensionIds: next, includeOptional });
  }

  function toggleOptional(checked: boolean) {
    setIncludeOptional(checked);
    emit({ templateId, extensionIds, includeOptional: checked });
  }

  const defaultCount = template ? template.columns.filter((c) => c.default_visible).length : 0;
  const totalCount = template ? template.columns.length : 0;
  const plannedCount =
    (includeOptional ? totalCount : defaultCount) +
    extensions.filter((e) => extensionIds.includes(e.id)).reduce((n, e) => n + e.columns.length, 0);

  return (
    <div className={classNames.root} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className={classNames.list} role="listbox" aria-label="Review template">
        {domains.map((domain) => (
          <div key={domain}>
            <div className={classNames.group} style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.6, margin: "8px 0 4px" }}>
              {domain}
            </div>
            {listTemplates(domain).map((t) => {
              const selected = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectTemplate(t.id)}
                  className={[classNames.item, selected ? classNames.itemSelected : ""].filter(Boolean).join(" ")}
                  style={{ display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "6px 8px" }}
                >
                  <span>{t.name}</span>
                  <small style={{ opacity: 0.6 }}>
                    {t.id} · {t.columns.length} cols
                  </small>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className={classNames.detail}>
        {template ? (
          <>
            <h3 style={{ margin: "0 0 8px" }}>{template.name}</h3>
            <p>
              <b>Each row is:</b> {template.row_grain}
            </p>
            <p>
              <b>Documents needed:</b> {template.required_documents.join("; ")}
            </p>
            {template.required_user_context.length > 0 && (
              <p>
                <b>You will be asked for:</b> {template.required_user_context.join("; ")}
              </p>
            )}
            {extensions.length > 0 && (
              <fieldset style={{ border: 0, padding: 0, margin: "8px 0" }}>
                <legend>
                  <b>Add coverage columns</b>
                </legend>
                <div className={classNames.chips} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {extensions.map((e) => (
                    <label key={e.id} className={classNames.chip} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={extensionIds.includes(e.id)} onChange={() => toggleExtension(e.id)} />
                      {e.name} <span style={{ opacity: 0.6 }}>({e.columns.length})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {totalCount > defaultCount && (
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={includeOptional} onChange={(e) => toggleOptional(e.target.checked)} />
                Include all {totalCount} template columns (default view has {defaultCount})
              </label>
            )}
            <p style={{ opacity: 0.7 }}>{plannedCount} columns will be created. Columns can be edited after the review exists.</p>
          </>
        ) : (
          <p style={{ opacity: 0.6 }}>Choose a template to see what each row represents and which documents it needs.</p>
        )}
      </div>
    </div>
  );
}
