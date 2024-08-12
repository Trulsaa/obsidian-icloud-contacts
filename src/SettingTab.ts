import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import ICloudContacts from "../main";
import { ICloudVCard } from "./ICloudContactsApi";

export interface ICloudContactsSettings {
	[key: string]:
		| string
		| boolean
		| ICloudContactsSettings
		| undefined
		| ICloudVCard[];
	username: string;
	password: string;
	folder: string;
	isNameHeading?: boolean;
	telLabels: boolean;
	emailLabels: boolean;
	urlLabels: boolean;
	relatedLabels: boolean;
	excludedKeys: string;
	previousUpdateSettings?: ICloudContactsSettings;
	previousUpdateData?: ICloudVCard[];
}

export const DEFAULT_SETTINGS: ICloudContactsSettings = {
	username: "",
	password: "",
	folder: "Contacts",
	isNameHeading: true,
	telLabels: false,
	emailLabels: false,
	urlLabels: false,
	relatedLabels: false,
	excludedKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality vnd63SensitiveContentConfig",
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

		let passwordInputEl: TextComponent;
		const passwordSettingEl = new Setting(containerEl)
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
						passwordInputEl = textEl;
					})
					.inputEl.setAttribute("type", "password"),
			);

		passwordSettingEl.addToggle((v) =>
			v.onChange((value) => {
				if (value) {
					passwordInputEl.inputEl.setAttribute("type", "clear");
				} else {
					passwordInputEl.inputEl.setAttribute("type", "password");
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

		containerEl.createEl("br");
		containerEl.createEl("h3", { text: "Parameters" });
		containerEl.createEl("small", {
			text: "Remember to run Update Contacts after changing any of the following to have the changes take effect.",
		});

		new Setting(containerEl)
			.setName("Add heading with contact name to the file contents")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.isNameHeading || true)
					.onChange(async (value) => {
						this.plugin.settings.isNameHeading = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Add labels to telephone numbers")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.telLabels)
					.onChange(async (value) => {
						this.plugin.settings.telLabels = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Add labels to emails")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.emailLabels)
					.onChange(async (value) => {
						this.plugin.settings.emailLabels = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Add labels to urls")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.urlLabels)
					.onChange(async (value) => {
						this.plugin.settings.urlLabels = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Add labels to related names")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.relatedLabels)
					.onChange(async (value) => {
						this.plugin.settings.relatedLabels = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Excluded keys")
			.setDesc(
				"A space delimited list of all the keys that should be excluded in the properties of each contact. The data will still be pressent under the iCloudVCard propertie",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						"Add space delimited list of keys to exclude",
					)
					.setValue(this.plugin.settings.excludedKeys)
					.onChange(async (value) => {
						this.plugin.settings.excludedKeys = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
