import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import ICloudContacts from "../main";

export interface ICloudContactsSettings {
	username: string;
	password: string;
	folder: string;
	addLabels: boolean;
	excludeKeys: string;
}

export const DEFAULT_SETTINGS: ICloudContactsSettings = {
	username: "",
	password: "",
	folder: "Contacts",
	addLabels: false,
	excludeKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSocialprofile xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality xSocialprofile",
};

export class SettingTab extends PluginSettingTab {
	plugin: ICloudContacts;

	constructor(app: App, plugin: ICloudContacts) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("iCloud username")
			.setDesc("The email used to login to iCloud")
			.addText((text) =>
				text
					.setPlaceholder("Enter your username")
					.setValue(this.plugin.settings.username)
					.onChange(async (value) => {
						this.plugin.settings.username = value;
						await this.plugin.saveSettings();
					}),
			);

		let inputEl: TextComponent;
		const apikeuEl = new Setting(containerEl)
			.setName("iCloud app specific password")
			.setDesc(
				"You need to generate an app-specific password for your iCloud account.",
			)
			.addText((text) =>
				text
					.setPlaceholder("App specific password")
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
					})
					.then((textEl) => {
						inputEl = textEl;
					})
					.inputEl.setAttribute("type", "password"),
			);

		apikeuEl.addToggle((v) =>
			v.onChange((value) => {
				if (value) {
					inputEl.inputEl.setAttribute("type", "clear");
				} else {
					inputEl.inputEl.setAttribute("type", "password");
				}
			}),
		);

		containerEl.appendChild(
			createEl("a", {
				text: "Create iCloud app specific password",
				href: "https://support.apple.com/en-us/102654",
				cls: "linkMoreInfo",
			}),
		);

		new Setting(containerEl)
			.setName("Contacts folder")
			.setDesc("The folder where contacts will be stored")
			.addText((text) =>
				text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						this.plugin.settings.folder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Add labels")
			.setDesc("Add labels to telephone numbers and emails. Make sure to run the 'Update all Contacts' function if you want labels on existing contacts. Otherwise labels will only apply to new and updated contacts after running 'Update Contacts'")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.addLabels)
					.onChange(async (value) => {
						this.plugin.settings.addLabels = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Excluded keys)")
			.setDesc(
				"A space delimited list of all the keys that should be excluded in the properties of each contact. The data will still be pressent under the iCloudVCard propertie",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						"Add space delimited list of keys to exclude",
					)
					.setValue(this.plugin.settings.excludeKeys)
					.onChange(async (value) => {
						this.plugin.settings.excludeKeys = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
