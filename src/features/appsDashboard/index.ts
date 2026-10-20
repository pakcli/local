import { Plugin, WorkspaceLeaf } from "obsidian";
import { AppDashboardStore } from "./store/AppDashboardStore";
import { AppsDashboardView, APPS_DASHBOARD_VIEW_TYPE } from "./ui/AppsDashboardView";
import {
  DEFAULT_APPS_DASHBOARD_SETTINGS,
  DEFAULT_FRONTMATTER_MAPPING,
  DEFAULT_VISIBLE_COLUMNS,
  type AppsDashboardSettings,
} from "./types";

export function registerAppsDashboard(plugin: Plugin): AppDashboardStore {
  const vaultRoot = (plugin as any).vaultRoot || "";
  const savedSettings = (plugin as any).settings?.appsDashboard;
  const initialSettings: AppsDashboardSettings = {
    ...DEFAULT_APPS_DASHBOARD_SETTINGS,
    ...(savedSettings || {}),
    frontmatterMapping: {
      ...DEFAULT_FRONTMATTER_MAPPING,
      ...(savedSettings?.frontmatterMapping || {}),
    },
    visibleColumns:
      Array.isArray(savedSettings?.visibleColumns) && savedSettings.visibleColumns.length > 0
        ? savedSettings.visibleColumns
        : [...DEFAULT_VISIBLE_COLUMNS],
  };

  const store = new AppDashboardStore(initialSettings, vaultRoot, async (updated) => {
    if ((plugin as any).settings) {
      (plugin as any).settings.appsDashboard = updated;
      if (typeof (plugin as any).saveSettings === "function") {
        await (plugin as any).saveSettings();
      }
    }
  });

  // 1. Register View
  plugin.registerView(
    APPS_DASHBOARD_VIEW_TYPE,
    (leaf: WorkspaceLeaf) => new AppsDashboardView(leaf, store)
  );

  // 2. Register Ribbon Icon
  plugin.addRibbonIcon("layout-grid", "Open Apps Dashboard & Hosting Manager", () => {
    void activateAppsDashboardView(plugin);
  });

  // 3. Register Command
  plugin.addCommand({
    id: "pakcli-open-apps-dashboard",
    name: "Apps Dashboard: Open Portfolio & Static Hosting Manager",
    callback: () => {
      void activateAppsDashboardView(plugin);
    },
  });

  return store;
}

export async function activateAppsDashboardView(plugin: Plugin): Promise<void> {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(APPS_DASHBOARD_VIEW_TYPE)[0];

  if (!leaf) {
    leaf = workspace.getLeaf("tab");
    await leaf.setViewState({
      type: APPS_DASHBOARD_VIEW_TYPE,
      active: true,
    });
  }

  workspace.revealLeaf(leaf);
}

export * from "./types";
export * from "./store/AppDashboardStore";
export * from "./ui/AppsDashboardView";
