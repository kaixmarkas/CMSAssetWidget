public with sharing class CmsAssetWidgetController {

    // =========================
    // DTOs
    // =========================

    // Workspace DTO
    public class W {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String n  { get; set; }
        public W(String i, String name) { id = i; n = name; }
    }

    // Channel DTO
    public class CH {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String n  { get; set; }
        @AuraEnabled public String t  { get; set; }
        public CH(String i, String name, String type) { id = i; n = name; t = type; }
    }

    // Asset DTO
    public class A {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String t  { get; set; }
        @AuraEnabled public String ct { get; set; }
        @AuraEnabled public String p  { get; set; }   // preview URL preferred
        @AuraEnabled public String d  { get; set; }   // delivery/download URL fallback
        @AuraEnabled public String ws { get; set; }   // workspace/contentSpaceId
        @AuraEnabled public Datetime pd { get; set; } // published date
    }

    // Config DTO
    public class C {
        @AuraEnabled public String k  { get; set; }   // widgetKey
        @AuraEnabled public String ws { get; set; }   // workspace id
        @AuraEnabled public String ch { get; set; }   // channel id
        @AuraEnabled public A a       { get; set; }   // selected asset (from stored config)
        @AuraEnabled public Boolean m { get; set; }   // admin flag
    }

    // =========================
    // Access
    // =========================

    @AuraEnabled(cacheable=true)
    public static Boolean isAdmin() {
        return FeatureManagement.checkPermission('Manage_CMS_Asset_Widget');
    }

    // =========================
    // Config (VIEWER SAFE - NO CALLOUTS)
    // =========================

    /**
     * Viewer-safe config: NO callouts.
     * Non-admins must never require CMS API access to render.
     */
    @AuraEnabled(cacheable=true)
    public static C getConfig(String k) {
        if (String.isBlank(k)) throw new AuraHandledException('widgetKey required');

        C o = new C();
        o.k = k;
        o.m = isAdmin();

        CMS_Asset_Widget_Config__c s = CMS_Asset_Widget_Config__c.getInstance(k);
        if (s != null) {
            o.ws = s.Workspace_ID__c;
            o.ch = s.Channel_ID__c;

            // Build asset DTO strictly from stored fields (no API calls)
            if (!String.isBlank(s.Asset_ID__c) || !String.isBlank(s.Asset_URL__c)) {
                A a = new A();
                a.id = s.Asset_ID__c;
                a.t  = s.Asset_Title__c;
                a.ct = s.Asset_Type__c;
                a.ws = s.Workspace_ID__c;
                a.p  = s.Asset_URL__c;
                a.d  = s.Asset_URL__c;
                o.a  = a;
            }
        }
        return o;
    }

    /**
     * Save config (admin only).
     * Performs CMS Delivery API callout to validate/normalize the selection,
     * then persists stable fields for viewer-safe rendering.
     */
    @AuraEnabled
    public static C saveConfig(String k, String ws, String chId, String id) {
        if (!isAdmin()) throw new AuraHandledException('No access');
        if (String.isBlank(k) || String.isBlank(ws) || String.isBlank(chId) || String.isBlank(id)) {
            throw new AuraHandledException('Missing values');
        }

        // Fetch details using selected channel (callout)
        A a = getAssetDetailsInternal(chId, ws, id);
        if (a == null) throw new AuraHandledException('Asset not found');

        // Images only (defense-in-depth)
        if (!isImageType(a.ct)) throw new AuraHandledException('Only image assets are allowed');

        // Choose a usable URL
        String chosenUrl = !String.isBlank(a.p) ? a.p : a.d;
        if (String.isBlank(chosenUrl)) throw new AuraHandledException('Asset URL not found');

        CMS_Asset_Widget_Config__c s = CMS_Asset_Widget_Config__c.getInstance(k);
        if (s == null) {
            s = new CMS_Asset_Widget_Config__c();
            s.SetupOwnerId = k; // Hierarchy custom setting keying
            s.Name = k;
        }

        s.Workspace_ID__c = ws;
        s.Channel_ID__c   = chId;
        s.Asset_ID__c     = a.id;
        s.Asset_Title__c  = a.t;
        s.Asset_Type__c   = a.ct;
        s.Asset_URL__c    = chosenUrl;

        upsert s;

        // Return DTO without additional callouts
        C o = new C();
        o.k  = k;
        o.m  = true;
        o.ws = ws;
        o.ch = chId;
        o.a  = a;
        // Ensure caller always gets a single URL field back
        o.a.p = chosenUrl;
        o.a.d = chosenUrl;
        return o;
    }

    // =========================
    // Picklists
    // =========================

    @AuraEnabled(cacheable=true)
    public static List<W> listWorkspaces() {
        List<W> r = new List<W>();
        for (ManagedContentSpace s : [
            SELECT Id, Name
            FROM ManagedContentSpace
            ORDER BY Name
        ]) {
            r.add(new W(s.Id, s.Name));
        }
        return r;
    }

    @AuraEnabled(cacheable=true)
    public static List<CH> listChannels() {
        List<CH> out = new List<CH>();
        for (ManagedContentChannel c : [
            SELECT Id, Name, Type
            FROM ManagedContentChannel
            ORDER BY Name
        ]) {
            out.add(new CH(c.Id, c.Name, String.valueOf(c.Type)));
        }
        return out;
    }

    // Keep method to avoid breaking any old callers
    @AuraEnabled(cacheable=true)
    public static List<A> listRecentPublishedAssets(String ws, Integer lim) {
        return new List<A>();
    }

    // =========================
    // Admin CMS Delivery (CALLOUTS)
    // =========================

    @AuraEnabled(cacheable=true)
    public static List<A> searchPublishedAssets(String ws, String chId, String q, Integer lim) {
        if (String.isBlank(ws) || String.isBlank(chId) || String.isBlank(q)) return new List<A>();

        Integer n = (lim == null || lim <= 0) ? 10 : Math.min(lim, 25);

        String p = '/services/data/v60.0/connect/cms/delivery/channels/'
            + EncodingUtil.urlEncode(chId, 'UTF-8')
            + '/contents/search?page=0&pageSize=' + n
            + '&queryTerm=' + EncodingUtil.urlEncode(q.trim(), 'UTF-8')
            + '&scope=All'
            + '&contentSpaceId=' + EncodingUtil.urlEncode(ws, 'UTF-8');

        List<A> out = new List<A>();
        for (Object o : li(gj(p))) {
            A a = pa(o);
            if (a == null) continue;
            if (!isImageType(a.ct)) continue; // images only
            out.add(a);
        }

        out.sort(new S());
        trimEnd(out, n);
        return out;
    }

    @AuraEnabled(cacheable=true)
    public static A getAssetDetails(String ws, String chId, String id) {
        if (String.isBlank(ws) || String.isBlank(chId) || String.isBlank(id)) return null;
        A a = getAssetDetailsInternal(chId, ws, id);
        if (a == null) return null;
        if (!isImageType(a.ct)) return null;
        return a;
    }

    private static A getAssetDetailsInternal(String chId, String ws, String id) {
        String p = '/services/data/v60.0/connect/cms/delivery/channels/'
            + EncodingUtil.urlEncode(chId, 'UTF-8')
            + '/contents/'
            + EncodingUtil.urlEncode(id, 'UTF-8');

        Map<String, Object> raw = gj(p);
        A a = pa(raw);

        // Optional workspace consistency check when present
        if (a != null && !String.isBlank(a.ws) && !String.isBlank(ws) && a.ws != ws) return null;
        return a;
    }

    // =========================
    // HTTP + parsing helpers
    // =========================

    private static Map<String, Object> gj(String p) {
        HttpRequest r = new HttpRequest();
        r.setMethod('GET');
        r.setEndpoint('callout:CMS_Internal' + p);
        r.setHeader('Content-Type', 'application/json');

        HttpResponse s = new Http().send(r);
        Integer sc = s.getStatusCode();
        if (sc < 200 || sc >= 300) throw new AuraHandledException('CMS ' + sc + ': ' + s.getBody());

        Object o = JSON.deserializeUntyped(s.getBody());
        return (o instanceof Map<String, Object>) ? (Map<String, Object>) o : new Map<String, Object>();
    }

    private static Boolean isImageType(String ct) {
        if (String.isBlank(ct)) return false;
        String s = ct.toLowerCase();
        // covers "cms_image", "image", and fully qualified names containing image
        return s.contains('image') || s.contains('cms_image');
    }

    private static String absUrl(String u) {
        if (String.isBlank(u)) return u;
        String s = u.trim();
        if (s.startsWith('http://') || s.startsWith('https://')) return s;
        if (s.startsWith('/')) return URL.getOrgDomainUrl().toExternalForm() + s;
        return s;
    }

    private static Datetime dt(String v) {
        if (String.isBlank(v)) return null;
        try {
            String s = v.trim();
            Integer ti = s.indexOf('T');
            if (ti < 0) return null;

            String ds = s.substring(0, ti);
            String ts = s.substring(ti + 1);

            Integer dot = ts.indexOf('.');
            if (dot >= 0) {
                Boolean hz = ts.indexOf('Z', dot) >= 0;
                ts = ts.substring(0, dot) + (hz ? 'Z' : '');
            }

            Integer z = ts.indexOf('Z');
            Integer p = ts.indexOf('+');
            Integer m = ts.indexOf('-');

            Integer si = -1;
            if (p > si) si = p;
            if (m > si) si = m;

            String tz = '';
            if (z >= 0) {
                tz = 'Z';
                ts = ts.substring(0, z);
            } else if (si > 0) {
                tz = ts.substring(si);
                ts = ts.substring(0, si);
            }

            Integer y  = Integer.valueOf(ds.substring(0, 4));
            Integer mo = Integer.valueOf(ds.substring(5, 7));
            Integer d  = Integer.valueOf(ds.substring(8, 10));

            Integer hh = 0, mmn = 0, ss = 0;
            if (!String.isBlank(ts)) {
                List<String> a = ts.split(':');
                if (a.size() > 0 && !String.isBlank(a[0])) hh = Integer.valueOf(a[0]);
                if (a.size() > 1 && !String.isBlank(a[1])) mmn = Integer.valueOf(a[1]);
                if (a.size() > 2 && !String.isBlank(a[2])) ss = Integer.valueOf(a[2]);
            }

            Datetime g = Datetime.newInstanceGmt(Date.newInstance(y, mo, d), Time.newInstance(hh, mmn, ss, 0));

            if (!String.isBlank(tz) && tz != 'Z') {
                Integer sign = tz.startsWith('-') ? -1 : 1;
                String tzz = tz.substring(1);

                Integer oh = 0, om = 0;
                if (tzz.contains(':')) {
                    List<String> b = tzz.split(':');
                    if (b.size() > 0 && !String.isBlank(b[0])) oh = Integer.valueOf(b[0]);
                    if (b.size() > 1 && !String.isBlank(b[1])) om = Integer.valueOf(b[1]);
                } else if (tzz.length() >= 2) {
                    oh = Integer.valueOf(tzz.substring(0, 2));
                    if (tzz.length() >= 4) om = Integer.valueOf(tzz.substring(2, 4));
                }
                g = g.addMinutes(-sign * (oh * 60 + om));
            }
            return g;
        } catch (Exception e) {
            return null;
        }
    }

    private static String nodeUrl(Object node) {
        if (!(node instanceof Map<String, Object>)) return null;
        Map<String, Object> n = (Map<String, Object>) node;

        String u = (String) n.get('url');
        if (String.isBlank(u)) u = (String) n.get('unauthenticatedUrl');
        if (!String.isBlank(u)) return u;

        Object v = n.get('value');
        if (v instanceof Map<String, Object>) {
            Map<String, Object> mv = (Map<String, Object>) v;
            u = (String) mv.get('url');
            if (String.isBlank(u)) u = (String) mv.get('unauthenticatedUrl');
            if (!String.isBlank(u)) return u;
        }
        return null;
    }

    private static A pa(Object o) {
        if (!(o instanceof Map<String, Object>)) return null;

        Map<String, Object> m = (Map<String, Object>) o;
        A a = new A();

        String ck = (String) m.get('contentKey');
        String i  = (String) m.get('id');
        a.id = !String.isBlank(ck) ? ck : i;

        a.t  = (String) m.get('title');

        // Content type extraction
        Object ctObj = m.get('contentType');
        if (ctObj instanceof Map<String, Object>) {
            Map<String, Object> ctm = (Map<String, Object>) ctObj;
            a.ct = (String) ctm.get('fullyQualifiedName');
            if (String.isBlank(a.ct)) {
                String devName = (String) ctm.get('developerName');
                if (!String.isBlank(devName)) a.ct = devName;
            }
            if (String.isBlank(a.ct)) {
                String label = (String) ctm.get('label');
                if (!String.isBlank(label)) a.ct = label;
            }
        } else {
            a.ct = (String) m.get('contentTypeFQN');
        }
        if (String.isBlank(a.ct)) a.ct = (String) m.get('contentTypeFQN');

        a.ws = (String) m.get('contentSpaceId');
        a.pd = dt((String) m.get('publishedDate'));

        a.p = (String) m.get('contentUrl');
        if (String.isBlank(a.p)) a.p = (String) m.get('unauthenticatedUrl');
        if (String.isBlank(a.p)) a.p = (String) m.get('url');

        a.d = (String) m.get('downloadUrl');
        if (String.isBlank(a.d)) a.d = a.p;

        // contentNodes fallback
        if (String.isBlank(a.p) && m.containsKey('contentNodes')) {
            Object no = m.get('contentNodes');

            if (no instanceof Map<String, Object>) {
                Map<String, Object> nm = (Map<String, Object>) no;
                for (String k : nm.keySet()) {
                    String u = nodeUrl(nm.get(k));
                    if (!String.isBlank(u)) { a.p = u; a.d = u; break; }
                }
            } else if (no instanceof List<Object>) {
                for (Object it : (List<Object>) no) {
                    String u = nodeUrl(it);
                    if (!String.isBlank(u)) { a.p = u; a.d = u; break; }
                }
            }
        }

        // Prefer sfdc_cms:media.url when present (true media URL)
        if (m.containsKey('contentBody')) {
            Object body = m.get('contentBody');
            if (body instanceof Map<String, Object>) {
                Map<String, Object> bm = (Map<String, Object>) body;
                if (bm.containsKey('sfdc_cms:media')) {
                    Object media = bm.get('sfdc_cms:media');
                    if (media instanceof Map<String, Object>) {
                        Map<String, Object> mm = (Map<String, Object>) media;
                        String mu = (String) mm.get('url');
                        if (!String.isBlank(mu)) { a.p = mu; a.d = mu; }
                    }
                }
            }
        }

        a.p = absUrl(a.p);
        a.d = absUrl(a.d);
        return a;
    }

    private static List<Object> li(Map<String, Object> r) {
        Object x = r.get('items');
        if (x == null) x = r.get('contents');
        if (x == null) x = r.get('managedContents');
        return (x instanceof List<Object>) ? (List<Object>) x : new List<Object>();
    }

    private static void trimEnd(List<A> out, Integer n) {
        if (out == null || n == null || n < 0) return;
        while (out.size() > n) out.remove(out.size() - 1);
    }

    // Sort by published date desc
    public class S implements System.Comparator<A> {
        public Integer compare(A x, A y) {
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;

            if (x.pd == y.pd) return 0;
            if (x.pd == null) return 1;
            if (y.pd == null) return -1;

            Long xt = x.pd.getTime();
            Long yt = y.pd.getTime();
            if (yt == xt) return 0;
            return (yt > xt) ? 1 : -1;
        }
    }
}
