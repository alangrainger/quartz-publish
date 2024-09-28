import { Notice, Plugin, TFile } from 'obsidian'
import { DEFAULT_SETTINGS, MyPluginSettings, MySettingTab } from './settings'
import { exec } from 'child_process'

const STATIC_FILES = [
  'icon.png',
  'og-image.png'
]

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings

  async onload () {
    await this.loadSettings()

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new MySettingTab(this.app, this))

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'publish',
      name: 'Publish the current folder with Quartz',
      callback: async () => {
        const file = this.app.workspace.getActiveFile()
        if (!file) return

        // Go up the file tree until we find an index.md with a `quartzPublishFolder` property
        let vaultFolder = '', outputFolder, metadata
        let parent = file.parent
        while (parent && !outputFolder) {
          // Look for an index.md file
          const indexFile = this.app.vault.getAbstractFileByPath(parent.path + '/index.md')
          if (indexFile instanceof TFile) {
            // Check for a `quartzPublishFolder` property
            metadata = this.app.metadataCache.getFileCache(indexFile)?.frontmatter
            outputFolder = metadata?.quartzPublishFolder?.replace(/\/$/, '')
          }
          if (outputFolder) {
            vaultFolder = parent.path
            break
          }
          // Navigate up one level
          parent = parent.parent
        }
        if (!outputFolder) {
          new Notice(`Unable to find a Quartz publish root folder anywhere in the current note's path`)
          return
        }
        const inputFolder = this.app.vault.adapter.getFullPath(vaultFolder)

        const notice = new Notice('Publishing folder...', 10000)

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
        const sedString = Object.entries(replacements)
          // You'll notice the sed match is all characters until the end of the line.
          // This will screw you up if your config file has multiple variables on the same line
          // or if it's all just a single line. So uhh don't do that.
          .map(([key, value]) => `s/${key}:.*/${key}: "${
            // Replace single quotes with the hex code so that they don't terminate the sed command
            value.replace(/['"]/g, '\\x27')
          }",/`).join('; ')
        await this.exec(`sed -i '${sedString}' "${this.settings.quartzPath}/quartz.config.ts"`)

        // Create the output folder in case it doesn't exist
        await this.exec(`mkdir -p ${outputFolder}`)

        // Execute the Quartz publish command
        const published = await this.exec(`npx quartz build --directory "${inputFolder}" --output "${outputFolder}"`, {
          cwd: this.settings.quartzPath,
          shell: '/bin/bash',
          env: { PATH: this.settings.envPath }
        })

        // Copy the static assets (favicon, etc) to the output folder
        for (const file of STATIC_FILES) {
          const filePath = `${inputFolder}/${file}`
          if (await this.exec(`test -f "${filePath}"`)) {
            await this.exec(`cp "${filePath}" "${outputFolder}/static/"`)
          }
        }

        notice.hide()
        new Notice(published ? 'Successfully published!' : 'Something went wrong :(')
      }
    })
  }

  async updateFrontmatterFields (file: TFile) {
    const contents = await this.app.vault.read(file)
    // Strip the frontmatter from the note body
    const body = contents.replace(/^---\r?\n(.*?)\n---\r?\n/s, '')
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      // Find the first H1
      const match = body.match(/^# (.+)$/m)
      if (match?.[1] && frontmatter.title !== match[1]) {
        // Set the title from the H1
        frontmatter.title = match[1]
      }
    })
  }

  /**
   * Wrap the child_process.exec command in a promise and return a boolean
   */
  async exec (command: string, options = {}) {
    return new Promise<boolean>((resolve) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          console.log(stderr)
          resolve(false)
        } else {
          if (stdout) console.log(stdout)
          resolve(true)
        }
      })
    })
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }
}
