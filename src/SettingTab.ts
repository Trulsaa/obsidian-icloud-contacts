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
	telLabels: boolean;
	emailLabels: boolean;
	urlLabels: boolean;
	relatedLabels: boolean;
	excludedKeys: string;
	previousUpdateSettings?: ICloudContactsSettings;
	previousUpdateData: ICloudVCard[];
}

export const DEFAULT_SETTINGS: ICloudContactsSettings = {
	username: "",
	password: "",
	folder: "Contacts",
	telLabels: false,
	emailLabels: false,
	urlLabels: false,
	relatedLabels: false,
	excludedKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
	previousUpdateData: [],
};

export function compareSettings(a: ICloudContactsSettings, b: ICloudContactsSettings) {
	return Object.entries(a)
		.filter(
			([key]) =>
				key !== "previousUpdateSettings" &&
				key !== "previousUpdateData",
		)
		.every(([key, value]) => value == b[key]);
}

function onChangeHandler(key: string, plugin: ICloudContacts) {
	return async (value: string | boolean) => {
		if (plugin.settings.previousUpdateSettings === undefined) {
			plugin.settings.previousUpdateSettings = DEFAULT_SETTINGS;
		}
		plugin.settings.previousUpdateSettings[key] = plugin.settings[key];
		plugin.settings[key] = value;
		await plugin.saveSettings();
	};
}

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
					.onChange(onChangeHandler("username", this.plugin)),
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
					.onChange(onChangeHandler("password", this.plugin))
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
					.onChange(onChangeHandler("folder", this.plugin)),
			);

		containerEl.createEl("br");
		containerEl.createEl("h3", { text: "Parameters" });

		new Setting(containerEl)
			.setName("Add labels to telephone numbers")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.telLabels)
					.onChange(onChangeHandler("telLabels", this.plugin)),
			);

		new Setting(containerEl)
			.setName("Add labels to emails")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.emailLabels)
					.onChange(onChangeHandler("emailLabels", this.plugin)),
			);

		new Setting(containerEl)
			.setName("Add labels to urls")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.urlLabels)
					.onChange(onChangeHandler("urlLabels", this.plugin)),
			);

		new Setting(containerEl)
			.setName("Add labels to related names")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.relatedLabels)
					.onChange(onChangeHandler("relatedLabels", this.plugin)),
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
					.onChange(onChangeHandler("excludedKeys", this.plugin)),
			);
	}
}
