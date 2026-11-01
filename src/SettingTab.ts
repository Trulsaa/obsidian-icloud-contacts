import {
	App,
	PluginSettingTab,
	SecretComponent,
	Setting,
	TextComponent,
} from "obsidian";
import ICloudContacts from "../main";
import { ICloudVCard } from "./ICloudContactsApi";
import { parseVCardToJCard } from "./parser";
import {
	clearPlaintextPassword,
	getSecretStorage,
	readSecret,
	resolvePassword,
} from "./secrets";

export interface ICloudContactsSettings {
	[key: string]:
		| string
		| string[]
		| boolean
		| ICloudContactsSettings
		| undefined
		| ICloudVCard[];
	username: string;
	password: string;
	passwordSecretName?: string;
	folder: string;
	isNameHeading?: boolean;
	telLabels: boolean;
	emailLabels: boolean;
	urlLabels: boolean;
	relatedLabels: boolean;
	addressLabels: boolean;
	listsProperty?: boolean;
	excludedKeys: string;
	downloadPhotos?: boolean;
	embedPhoto?: boolean;
	photoFolder?: string;
	customContent?: string;
	iCloudServerUrl: string;
	previousUpdateSettings?: ICloudContactsSettings;
	previousUpdateData?: ICloudVCard[];
	groups: string[];
}

export const DEFAULT_SETTINGS: ICloudContactsSettings = {
	username: "",
	password: "",
	passwordSecretName: "",
	folder: "Contacts",
	isNameHeading: true,
	telLabels: false,
	emailLabels: false,
	urlLabels: false,
	relatedLabels: false,
	addressLabels: false,
	iCloudServerUrl: "https://contacts.icloud.com",
	excludedKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality vnd63SensitiveContentConfig",
	groups: [],
};

export class SettingTab extends PluginSettingTab {
	plugin: ICloudContacts;

	constructor(
		app: App,
		plugin: ICloudContacts,
		private fetchContacts: (
			username: string,
			password: string,
			serverUrl: string,
		) => Promise<ICloudVCard[]>,
	) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		this.ensureStyles();

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

		if (this.canUseSecretStorage()) {
			new Setting(containerEl)
				.setName("iCloud app specific password")
				.setDesc(
					"You need to generate an app-specific password for your iCloud account. Select a secret from Obsidian's keychain or create a new one.",
				)
				.addComponent((el) =>
					new SecretComponent(this.app, el)
						.setValue(this.plugin.settings.passwordSecretName ?? "")
						.onChange(async (value) => {
							this.plugin.settings.passwordSecretName =
								value ?? "";
							if (value && readSecret(this.app, value)) {
								clearPlaintextPassword(this.plugin.settings);
							}
							await this.plugin.saveSettings();
						}),
				);
		} else {
			this.addPlaintextPasswordSetting(containerEl);
		}

		containerEl.appendChild(
			createEl("a", {
				text: "Create iCloud app specific password",
				href: "https://support.apple.com/en-us/102654",
				cls: "linkMoreInfo",
			}),
		);

		new Setting(containerEl)
			.setName("ICloud server URL")
			.setDesc(
				"The URL of the iCloud server. Defaults to 'https://contacts.icloud.com'. Chinese users may need to change this to 'https://contacts.icloud.com.cn'",
			)
			.addText((text) =>
				text
					.setPlaceholder("Url of the iCloud server")
					.setValue(this.plugin.settings.iCloudServerUrl)
					.onChange(async (value) => {
						this.plugin.settings.iCloudServerUrl = value;
						await this.plugin.saveSettings();
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
					.setValue(!!this.plugin.settings.isNameHeading)
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
			.setName("Add labels to addresses")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.addressLabels)
					.onChange(async (value) => {
						this.plugin.settings.addressLabels = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Add iCloud lists to contacts")
			.setDesc(
				"Adds a 'lists' property with the names of the iCloud lists (groups) each contact belongs to. Works independently of the sync filter in the Groups section below.",
			)
			.addToggle((bool) =>
				bool
					.setValue(!!this.plugin.settings.listsProperty)
					.onChange(async (value) => {
						this.plugin.settings.listsProperty = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Download contact photos")
			.setDesc(
				"Saves each contact's photo as an image file in the vault and links it in the 'photo file' property.",
			)
			.addToggle((bool) =>
				bool
					.setValue(!!this.plugin.settings.downloadPhotos)
					.onChange(async (value) => {
						this.plugin.settings.downloadPhotos = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show photo under the title")
			.setDesc(
				"Embeds the downloaded photo under the title in the contact file. The plugin only manages that one embed line, so anything you write below it is kept. Requires 'Download contact photos'.",
			)
			.addToggle((bool) =>
				bool
					.setValue(!!this.plugin.settings.embedPhoto)
					.onChange(async (value) => {
						this.plugin.settings.embedPhoto = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Photos folder")
			.setDesc(
				"The folder where contact photos will be stored. Defaults to a 'Photos' folder inside the contacts folder.",
			)
			.addText((text) =>
				text
					.setPlaceholder(`${this.plugin.settings.folder}/Photos`)
					.setValue(this.plugin.settings.photoFolder ?? "")
					.onChange(async (value) => {
						this.plugin.settings.photoFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Custom content")
			.setDesc(
				"Markdown added to every contact file, below the title and photo. Leave empty to disable. The plugin does not mark the added text in the file. It finds it again by matching the previous content of this setting exactly, line for line. If you edit the added text in a contact file, it will no longer be found, so it will not be updated or removed when you change or clear this setting, and changed content is added as a new block next to your edited text. If you delete the text from a file it is not added back unless you change this setting. Change the content here, not in the files. Text you already added by hand is not touched, but identical text is not added twice.",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						'```dataviewjs\ndv.view("Scripts/Contact")\n```',
					)
					.setValue(this.plugin.settings.customContent ?? "")
					.onChange(async (value) => {
						this.plugin.settings.customContent = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Excluded keys")
			.setDesc(
				"A space delimited list of the vCard keys that should be excluded from the properties of each contact. The data will still be pressent under the iCloudVCard propertie",
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

		containerEl.createEl("br");
		containerEl.createEl("h3", { text: "Groups" });
		const loadingWrapper = containerEl.createDiv({
			cls: "icloud-contacts-loading",
		});
		loadingWrapper.createDiv({ cls: "icloud-contacts-spinner" });
		loadingWrapper.createEl("small", { text: "Loading groups..." });

		this.fetchContacts(
			this.plugin.settings.username,
			resolvePassword(this.app, this.plugin.settings),
			this.plugin.settings.iCloudServerUrl,
		)
			.then((contacts) => {
				// get groups
				const groups = contacts
					.map((iCloudVCard) => parseVCardToJCard(iCloudVCard.data))
					.filter((jCard) => {
						const kindJCard = jCard.find(
							(o) => o.key === "xAddressbookserverKind",
						);
						return kindJCard && kindJCard.value === "group";
					});

				loadingWrapper.remove();

				if (groups.length === 0) {
					containerEl.createEl("p", {
						text: "No groups found",
					});
				}

				if (groups.length > 0) {
					for (const group of groups) {
						const fnJCard = group.find((o) => o.key === "fn");
						const uidJCard = group.find((o) => o.key === "uid");

						if (
							fnJCard &&
							!Array.isArray(fnJCard.value) &&
							uidJCard &&
							!Array.isArray(uidJCard.value)
						) {
							new Setting(containerEl)
								.setName(fnJCard.value)
								.addToggle((bool) =>
									bool
										.setValue(
											this.plugin.settings.groups.includes(
												uidJCard.value as string,
											),
										)
										.onChange(async (value) => {
											if (value) {
												this.plugin.settings.groups.push(
													uidJCard.value as string,
												);
											} else {
												this.plugin.settings.groups =
													this.plugin.settings.groups.filter(
														(i) =>
															i !==
															(uidJCard.value as string),
													);
											}
											await this.plugin.saveSettings();
										}),
								);
						}
					}
				}
			})
			.catch((error) => {
				loadingWrapper.remove();
				containerEl.createEl("p", {
					text:
						"Error loading groups: " +
						(error instanceof Error
							? error.message
							: String(error)),
				});
			});
	}

	private canUseSecretStorage(): boolean {
		return (
			typeof SecretComponent === "function" &&
			getSecretStorage(this.app) !== null
		);
	}

	private addPlaintextPasswordSetting(containerEl: HTMLElement): void {
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
	}

	private ensureStyles(): void {
		if (document.getElementById("icloud-contacts-settings-style")) {
			return;
		}

		const style = document.createElement("style");
		style.id = "icloud-contacts-settings-style";
		style.textContent = `
.icloud-contacts-loading {
	display: flex;
	align-items: center;
	gap: 6px;
}

.icloud-contacts-spinner {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 2px solid var(--text-muted);
	border-top-color: transparent;
	animation: icloud-contacts-spin 0.8s linear infinite;
}

@keyframes icloud-contacts-spin {
	to {
		transform: rotate(360deg);
	}
}
`;

		document.head.appendChild(style);
	}
}
