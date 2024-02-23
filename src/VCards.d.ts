export type VCards =
	| {
			key: "n";
			meta: {};
			type: "text";
			value: [string, string, string, string, string];
	  }
	| {
			key: "fn";
			meta: {};
			type: "text";
			value: string;
	  }
	| {
			key: "impp";
			meta: {
				group: string;
				type?: string[];
				xServiceType: string;
				xTeamidentifier: string;
				xBundleidentifiers: string;
			};
			type: "text";
			value: string;
	  }
	| {
			key: "org";
			meta: {};
			type: "text";
			value: [string, string];
	  }
	| {
			key: "bday";
			meta: { value: "date" };
			type: "date";
			value: string;
	  }
	| { key: "nickname"; meta: {}; type: "text"; value: string }
	| { key: "note"; meta: {}; type: "text"; value: string }
	| {
			key: "tel";
			meta: { group?: string; type?: string[] | string };
			type: "text";
			value: string;
	  }
	| {
			key: "email";
			meta: { group?: string; type?: string[] | string };
			type: "text";
			value: string;
	  }
	| {
			key: "xAbLabel";
			meta: { group: string };
			type: "text";
			value: string;
	  }
	| {
			key: "adr";
			meta: { group?: string; type?: string[] | string };
			type: "text";
			value: [string, string, string, string, string, string, string];
	  }
	| {
			key: "xAbadr";
			meta: { group: string };
			type: "text";
			value: string;
	  }
	| {
			key: "url";
			meta: { group?: string; type?: string[] | string };
			type: "text";
			value: string;
	  }
	| {
			key: "xAbrelatednames";
			meta: { group: string; type?: "pref" };
			type: "text";
			value: string;
	  }
	| {
			key: "photo";
			meta: {
				xAbcropRectangle: string;
				value: "uri";
			};
			type: "uri";
			value: string;
	  }
	| {
			key: "xSocialprofile";
			meta: {
				type?: string;
				xUser?: string;
				xTeamidentifier?: string;
				xBundleidentifiers?: string;
			};
			type: "text";
			value: string;
	  }
	| {
			key: "xAbdate";
			meta: { group: string; type?: "pref" };
			type: "text";
			value: string;
	  };
