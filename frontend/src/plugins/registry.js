/**
 * Plugin registry — lightweight system for optional features.
 * Plugins register themselves at import time; activation is lazy and explicit.
 */

const plugins = new Map();

export function registerPlugin(id, plugin) {
  plugins.set(id, plugin);
}

export function getPlugin(id) {
  return plugins.get(id);
}

export function getPluginIds() {
  return Array.from(plugins.keys());
}

export function isPluginEnabled(id) {
  const plugin = plugins.get(id);
  return plugin?.enabled ?? false;
}
