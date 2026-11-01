import { describe, expect, jest, test } from "@jest/globals";
import { ICloudContactsSettings } from "./SettingTab";
import {
	PASSWORD_SECRET_ID,
	getSecretStorage,
	migratePasswordToSecretStorage,
	resolvePassword,
} from "./secrets";

function createStorage(initial: Record<string, string> = {}) {
	const secrets = { ...initial };
	return {
		secrets,
		getSecret: jest.fn((id: string) => secrets[id] ?? null),
		setSecret: jest.fn((id: string, value: string) => {
			secrets[id] = value;
		}),
	};
}

function createSettings(
	overrides: Partial<ICloudContactsSettings> = {},
): ICloudContactsSettings {
	return {
		username: "user",
		password: "",
		folder: "Contacts",
		telLabels: false,
		emailLabels: false,
		urlLabels: false,
		relatedLabels: false,
		addressLabels: false,
		excludedKeys: "",
		iCloudServerUrl: "https://contacts.icloud.com",
		groups: [],
		...overrides,
	};
}

describe("getSecretStorage", () => {
	test("returns null when the app has no secretStorage", () => {
		expect(getSecretStorage({})).toBeNull();
		expect(getSecretStorage({ secretStorage: null })).toBeNull();
	});

	test("returns null when secretStorage lacks the methods", () => {
		expect(getSecretStorage({ secretStorage: {} })).toBeNull();
	});

	test("returns the storage when it is usable", () => {
		const storage = createStorage();
		expect(getSecretStorage({ secretStorage: storage })).toBe(storage);
	});
});

describe("resolvePassword", () => {
	test("reads the secret when a secret name is set", () => {
		const storage = createStorage({ mine: "from-secret" });
		const settings = createSettings({ passwordSecretName: "mine" });
		expect(resolvePassword({ secretStorage: storage }, settings)).toBe(
			"from-secret",
		);
	});

	test("falls back to the plaintext password when the secret is missing", () => {
		const settings = createSettings({
			passwordSecretName: "mine",
			password: "plain",
		});
		expect(
			resolvePassword({ secretStorage: createStorage() }, settings),
		).toBe("plain");
	});

	test("uses the plaintext password when secret storage is unavailable", () => {
		const settings = createSettings({
			passwordSecretName: "mine",
			password: "plain",
		});
		expect(resolvePassword({}, settings)).toBe("plain");
	});

	test("falls back when reading the secret throws", () => {
		const storage = createStorage();
		storage.getSecret.mockImplementation(() => {
			throw new Error("unsupported");
		});
		jest.spyOn(console, "error").mockImplementation(() => {});
		const settings = createSettings({
			passwordSecretName: "mine",
			password: "plain",
		});
		expect(resolvePassword({ secretStorage: storage }, settings)).toBe(
			"plain",
		);
	});
});

describe("migratePasswordToSecretStorage", () => {
	test("moves the plaintext password into secret storage", () => {
		const storage = createStorage();
		const settings = createSettings({
			password: "plain",
			previousUpdateSettings: createSettings({ password: "plain" }),
		});

		expect(
			migratePasswordToSecretStorage({ secretStorage: storage }, settings),
		).toBe(true);
		expect(storage.secrets[PASSWORD_SECRET_ID]).toBe("plain");
		expect(settings.passwordSecretName).toBe(PASSWORD_SECRET_ID);
		expect(settings.password).toBe("");
		expect(settings.previousUpdateSettings?.password).toBe("");
		expect(resolvePassword({ secretStorage: storage }, settings)).toBe(
			"plain",
		);
	});

	test("keeps the plaintext password when secret storage is unavailable", () => {
		const settings = createSettings({ password: "plain" });
		expect(migratePasswordToSecretStorage({}, settings)).toBe(false);
		expect(settings.password).toBe("plain");
		expect(settings.passwordSecretName).toBeUndefined();
	});

	test("keeps the plaintext password when storing throws", () => {
		const storage = createStorage();
		storage.setSecret.mockImplementation(() => {
			throw new Error("unsupported");
		});
		jest.spyOn(console, "error").mockImplementation(() => {});
		const settings = createSettings({ password: "plain" });

		expect(
			migratePasswordToSecretStorage({ secretStorage: storage }, settings),
		).toBe(false);
		expect(settings.password).toBe("plain");
		expect(settings.passwordSecretName).toBeUndefined();
	});

	test("keeps the plaintext password when the secret does not read back", () => {
		const storage = createStorage();
		storage.setSecret.mockImplementation(() => {});
		const settings = createSettings({ password: "plain" });

		expect(
			migratePasswordToSecretStorage({ secretStorage: storage }, settings),
		).toBe(false);
		expect(settings.password).toBe("plain");
	});

	test("does nothing when there is no plaintext password", () => {
		const storage = createStorage();
		const settings = createSettings({ passwordSecretName: "mine" });
		expect(
			migratePasswordToSecretStorage({ secretStorage: storage }, settings),
		).toBe(false);
		expect(storage.setSecret).not.toHaveBeenCalled();
	});

	test("only clears the leftover plaintext when the chosen secret exists", () => {
		const storage = createStorage({ mine: "from-secret" });
		const settings = createSettings({
			passwordSecretName: "mine",
			password: "plain",
		});

		expect(
			migratePasswordToSecretStorage({ secretStorage: storage }, settings),
		).toBe(true);
		expect(settings.password).toBe("");
		expect(storage.secrets.mine).toBe("from-secret");
		expect(storage.setSecret).not.toHaveBeenCalled();
	});
});
