import { LightningElement, api, track } from "lwc";
import isAdmin from "@salesforce/apex/CmsAssetWidgetController.isAdmin";
import getConfig from "@salesforce/apex/CmsAssetWidgetController.getConfig";
import saveConfig from "@salesforce/apex/CmsAssetWidgetController.saveConfig";
import listWorkspaces from "@salesforce/apex/CmsAssetWidgetController.listWorkspaces";
import listChannels from "@salesforce/apex/CmsAssetWidgetController.listChannels";

// Admin-only CMS operations (Apex callouts)
import searchPublishedAssets from "@salesforce/apex/CmsAssetWidgetController.searchPublishedAssets";
import getAssetDetails from "@salesforce/apex/CmsAssetWidgetController.getAssetDetails";

export default class CmsAssetWidget extends LightningElement {
  @api widgetKey;

  @track wsOpts = [];
  @track chOpts = [];
  @track srchOpts = [];
  @track err;

  isAdmin = false;

  wsId;
  chId;

  assetId;
  assetTitle;
  assetType;
  assetUrl;

  q = "";
  searching = false;
  show = false;

  draftId;
  saving = false;

  /* ---------- Derived ---------- */

  get hasAsset() {
    return !!this.assetUrl;
  }

  get isImg() {
    return this.assetType && this.assetType.toLowerCase().includes("image");
  }

  get cardTitle() {
    return this.assetTitle || "Content";
  }

  get searchDisabled() {
    // Search is admin-only; disabling when missing required inputs.
    return !this.isAdmin || !this.wsId || !this.chId;
  }

  get canSave() {
    return (
      this.isAdmin &&
      !!this.widgetKey &&
      !!this.wsId &&
      !!this.chId &&
      !!this.draftId &&
      this.isImg &&
      !this.saving
    );
  }

  get saveDisabled() {
    return !this.canSave;
  }

  get saveLabel() {
    return this.saving ? "Saving..." : "Save";
  }

  get hasSaved() {
    return !!this.assetId && !!this.draftId && this.assetId === this.draftId;
  }

  /* ---------- Lifecycle ---------- */

  async connectedCallback() {
    try {
      this.isAdmin = await isAdmin();

      if (this.isAdmin && !this.widgetKey) {
        this.err = "Widget Key is required.";
      }

      if (this.widgetKey) {
        const cfg = await getConfig({ k: this.widgetKey });

        this.wsId = cfg?.ws;
        this.chId = cfg?.ch;

        if (cfg?.a) {
          this.apply(cfg.a);
          this.assetId = cfg.a.id;
          this.draftId = cfg.a.id;
        }
      }

      if (this.isAdmin) {
        const [ws, ch] = await Promise.all([listWorkspaces(), listChannels()]);

        this.wsOpts = (ws || []).map((x) => ({ label: x.n, value: x.id }));
        this.chOpts = (ch || []).map((x) => ({ label: x.n, value: x.id }));

        if (!this.wsId && this.wsOpts.length) this.wsId = this.wsOpts[0].value;
        if (!this.chId && this.chOpts.length) this.chId = this.chOpts[0].value;
      }
    } catch (e) {
      this.err = this.msg(e);
    }
  }

  /* ---------- Helpers ---------- */

  apply(a) {
    const url = a && (a.p || a.d);
    this.assetTitle = a?.t || null;
    this.assetType = a?.ct || null;
    this.assetUrl = url ? this.absUrl(url) : null;
  }

  absUrl(u) {
    if (!u) return u;
    const s = String(u).trim();
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return `${window.location.origin}${s}`;
    return s;
  }

  msg(e) {
    return e?.body?.message || e?.message || "Error";
  }

  clearDraftAndResults() {
    this.draftId = null;
    this.srchOpts = [];
    this.q = "";
  }

  clearPreview() {
    this.assetUrl = null;
    this.assetTitle = null;
    this.assetType = null;
  }

  setMissingKeyErrMaybe() {
    this.err = !this.widgetKey && this.isAdmin ? "Widget Key is required." : null;
  }

  /* ---------- Workspace / Channel ---------- */

  wsChg(e) {
    this.wsId = e.detail.value;
    this.setMissingKeyErrMaybe();
    this.clearDraftAndResults();
    this.clearPreview();
  }

  chChg(e) {
    this.chId = e.detail.value;
    this.setMissingKeyErrMaybe();
    this.clearDraftAndResults();
    this.clearPreview();
  }

  /* ---------- Search (ADMIN ONLY via Apex) ---------- */

  qChg(e) {
    this.q = e.target.value || "";
  }

  async qKey(e) {
    if (e.key !== "Enter") return;

    // Non-admin must never invoke callouts.
    if (!this.isAdmin) return;

    const s = (this.q || "").trim();
    if (!s || !this.wsId || !this.chId) {
      this.srchOpts = [];
      return;
    }

    this.searching = true;
    this.setMissingKeyErrMaybe();
    this.err = null;

    try {
      const res = await searchPublishedAssets({
        ws: this.wsId,
        chId: this.chId,
        q: s,
        lim: 25
      });

      // Server already enforces images-only, but keep UI defensive.
      const items = (res || []).filter((a) => a?.ct && a.ct.toLowerCase().includes("image"));

      this.srchOpts = items.map((a) => ({
        label: a.t,
        value: a.id
      }));

      if (!this.srchOpts.length) {
        this.err = "No image assets found.";
      }
    } catch (x) {
      this.err = this.msg(x);
      this.srchOpts = [];
    } finally {
      this.searching = false;
    }
  }

  /* ---------- Selection (ADMIN ONLY via Apex) ---------- */

  async assetPick(e) {
    // Non-admin must never invoke callouts.
    if (!this.isAdmin) return;

    this.draftId = e.detail.value;

    if (!this.wsId || !this.chId || !this.draftId) return;

    this.err = null;

    try {
      const a = await getAssetDetails({
        ws: this.wsId,
        chId: this.chId,
        id: this.draftId
      });

      const url = a && (a.p || a.d);

      if (!a || !url) {
        this.clearPreview();
        this.err = "Selected asset has no usable image URL.";
        return;
      }

      this.apply(a);

      if (!this.isImg) {
        this.clearPreview();
        this.err = "Only image assets are allowed.";
      }
    } catch (x) {
      this.clearPreview();
      this.err = this.msg(x);
    }
  }

  /* ---------- Save (ADMIN ONLY via Apex) ---------- */

  async save() {
    if (!this.canSave) return;

    this.saving = true;
    this.err = null;

    try {
      // NOTE: matches final Apex signature: saveConfig(k, ws, chId, id)
      const cfg = await saveConfig({
        k: this.widgetKey,
        ws: this.wsId,
        chId: this.chId,
        id: this.draftId
      });

      const a = cfg?.a;
      const url = a && (a.p || a.d);

      if (a && url) {
        this.apply(a);
        this.assetId = a.id;
        this.draftId = a.id;
      } else {
        this.err = "Saved, but image URL not returned.";
      }
    } catch (x) {
      this.err = this.msg(x);
    } finally {
      this.saving = false;
    }
  }

  /* ---------- Modal ---------- */

  open() {
    if (this.hasAsset) this.show = true;
  }

  openKey(e) {
    if (e.key === "Enter" || e.key === " ") this.open();
  }

  close() {
    this.show = false;
  }
}