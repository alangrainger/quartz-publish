import { Plugin, TFile } from 'obsidian'
import { DEFAULT_SETTINGS, MyPluginSettings, MySettingTab } from './settings'
import { exec } from 'child_process'

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings

  async onload () {
    await this.loadSettings()

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'publish',
      name: 'Publish the current folder with Quartz',
      callback: async () => {
        const file = this.app.workspace.getActiveFile()
        if (!file) return

        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter
        const vaultFolder = file.parent?.path || ''
        const inputFolder = this.app.vault.adapter.getFullPath(vaultFolder)
        const outputFolder = metadata?.quartzPublishFolder
        if (!outputFolder) {
          console.log(`This doesn't appear to be a Quartz publish root folder`)
          return
        }

        // Loop through all files which will be uploaded, and modify their frontmatter (if needed).
        // I'm sure there's a much more "correct" way to find these files - let me know if you know.
        const uploadFiles = this.app.vault.getFiles().filter((file: TFile) => file.path.startsWith(vaultFolder))
        for (const uploadFile of uploadFiles) {
          // Update the frontmatter fields
          await this.updateFrontmatterFields(uploadFile)
        }

        // Modify Quartz config before publishing
        const replacements = {
          pageTitle: metadata?.quartzSiteTitle || '',
          baseUrl: metadata?.quartzBaseUrl || ''
        }
        const sed = Object.entries(replacements)
          .map(([key, value]) => `s/${key}:.*/${key}: "${
            // Replace single quotes with the hex code so that they don't terminate the sed command
            value.replace(/['"]/g, '\\x27')
          }",/`)
          .join('; ')

        await new Promise<void>((resolve) => {
          exec(`sed -i '${sed}' ${this.settings.quartzPath}/quartz.config.ts`, (_error, _stdout, stderr) => {
            if (stderr) console.log(stderr)
            resolve()
          })
        })

        // Execute the Quartz publish command
        exec(`npx quartz build --directory "${inputFolder}" --output "${outputFolder}"`, {
          cwd: this.settings.quartzPath,
          shell: '/bin/bash',
          env: {
            PATH: this.settings.envPath
          }
        }, (_error, stdout, stderr) => {
          if (stderr) console.log(stderr)
          if (stdout) console.log(stdout)
        })
      }
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new MySettingTab(this.app, this))
  }

  async updateFrontmatterFields (file: TFile) {
    let contents = await this.app.vault.read(file)
    // Strip the frontmatter (if any)
    contents = contents.replace(/^---\r?\n(.*?)\n---\r?\n/s, '')
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      // Find the first H1
      const match = contents.match(/^# (.+)$/m)
      if (match?.[1]) {
        // Set the title from the H1
        frontmatter.title = match?.[1]
      }
    })
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }
}
