import type { ICloudContactsSettings } from "./SettingTab";

export const PASSWORD_SECRET_ID = "icloud-contacts-app-password";

export interface SecretStorageLike {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

export interface AppWithSecretStorage {
	secretStorage?: Partial<SecretStorageLike> | null;
}

// Obsidian's SecretStorage needs 1.11.4+ and may be missing on other platforms
export function getSecretStorage(
	app: AppWithSecretStorage,
): SecretStorageLike | null {
	const storage = app.secretStorage;
	if (
		storage &&
		typeof storage.getSecret === "function" &&
		typeof storage.setSecret === "function"
	) {
		return storage as SecretStorageLike;
	}
	return null;
}

export function readSecret(app: AppWithSecretStorage, id: string): string | null {
	try {
		return getSecretStorage(app)?.getSecret(id) || null;
	} catch (e) {
		console.error(e);
		return null;
	}
}

export function resolvePassword(
	app: AppWithSecretStorage,
	settings: ICloudContactsSettings,
): string {
	if (settings.passwordSecretName) {
		const secret = readSecret(app, settings.passwordSecretName);
		if (secret) return secret;
	}
	return settings.password;
}

export function clearPlaintextPassword(settings: ICloudContactsSettings) {
	settings.password = "";
	if (settings.previousUpdateSettings) {
		settings.previousUpdateSettings.password = "";
	}
}

/**
 * Moves a plaintext password from the plugin settings into SecretStorage.
 * The plaintext is only removed once the secret reads back identically, so
 * nothing is lost if storing fails. Returns true when settings were changed.
 */
export function migratePasswordToSecretStorage(
	app: AppWithSecretStorage,
	settings: ICloudContactsSettings,
): boolean {
	if (!settings.password) return false;
	const storage = getSecretStorage(app);
	if (!storage) return false;

	try {
		if (
			settings.passwordSecretName &&
			readSecret(app, settings.passwordSecretName)
		) {
			clearPlaintextPassword(settings);
			return true;
		}

		const id = settings.passwordSecretName || PASSWORD_SECRET_ID;
		storage.setSecret(id, settings.password);
		if (storage.getSecret(id) !== settings.password) return false;

		settings.passwordSecretName = id;
		clearPlaintextPassword(settings);
		return true;
	} catch (e) {
		console.error(e);
		return false;
	}
}
