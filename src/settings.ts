import { App, PluginSettingTab, Setting } from 'obsidian'
import MyPlugin from './main'

export interface MyPluginSettings {
  quartzPath: string;
  envPath: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
  quartzPath: '',
  envPath: '/usr/bin'
}

export class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin

  constructor (app: App, plugin: MyPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display (): void {
    const { containerEl } = this

    containerEl.empty()

    new Setting(containerEl)
      .setName('Path to your Quartz install')
      // .setDesc('')
      .addText(text => text
        .setPlaceholder('/home/user/dev/quartz')
        .setValue(this.plugin.settings.quartzPath)
        .onChange(async (value) => {
          this.plugin.settings.quartzPath = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('NPX and NodeJS path(s)')
      .setDesc('Add the paths to your npx and node executables, in your PATH environment variable format.')
      .addText(text => text
        .setPlaceholder('/usr/bin')
        .setValue(this.plugin.settings.envPath)
        .onChange(async (value) => {
          this.plugin.settings.envPath = value
          await this.plugin.saveSettings()
        }))
  }
}
