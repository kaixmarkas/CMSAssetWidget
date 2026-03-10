@IsTest
private class CmsAssetWidgetControllerTest {
    private class MockCms implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest r) {
            HttpResponse h = new HttpResponse();
            h.setStatusCode(200);
            h.setBody(
                r.getEndpoint().contains('/contents/search')
                ? '{"items":[{"contentKey":"img1","title":"One","contentType":{"fullyQualifiedName":"cms_image"},"contentSpaceId":"WS1","publishedDate":"2026-03-01T10:00:00.000Z","contentUrl":"/img1.png"},{"contentKey":"doc1","title":"Doc","contentType":{"developerName":"document"},"contentSpaceId":"WS1","publishedDate":"2026-03-03T10:00:00.000Z","contentUrl":"/doc.pdf"},{"id":"img2","title":"Two","contentTypeFQN":"image","contentSpaceId":"WS1","publishedDate":"2026-03-05T10:00:00.000Z","downloadUrl":"https://cdn.example.com/img2.png"}]}'
                : '{"contentKey":"img3","title":"Three","contentType":{"label":"Image"},"contentSpaceId":"WS1","publishedDate":"2026-03-01T09:00:00.000+02:00","contentNodes":[{"value":{"unauthenticatedUrl":"/node3.png"}}]}'
            );
            return h;
        }
    }

    @IsTest
    static void testController() {
        String k = UserInfo.getOrganizationId();

        System.assertEquals(false, CmsAssetWidgetController.isAdmin());

        try {
            CmsAssetWidgetController.getConfig('');
            System.assert(false);
        } catch (Exception e) {}

        CmsAssetWidgetController.C c = CmsAssetWidgetController.getConfig(k);
        System.assertEquals(k, c.k);
        System.assertEquals(false, c.m);
        System.assertNotEquals(null, CmsAssetWidgetController.listWorkspaces());
        System.assertNotEquals(null, CmsAssetWidgetController.listChannels());
        System.assertEquals(0, CmsAssetWidgetController.listRecentPublishedAssets('WS1', 5).size());
        System.assertEquals(0, CmsAssetWidgetController.searchPublishedAssets(null, 'CH1', 'x', 1).size());
        System.assertEquals(null, CmsAssetWidgetController.getAssetDetails('', 'CH1', 'A1'));

        Test.setMock(HttpCalloutMock.class, new MockCms());

        Test.startTest();
        List<CmsAssetWidgetController.A> found = CmsAssetWidgetController.searchPublishedAssets('WS1', 'CH1', 'cat', 1);
        CmsAssetWidgetController.A good = CmsAssetWidgetController.getAssetDetails('WS1', 'CH1', 'img3');
        CmsAssetWidgetController.A bad = CmsAssetWidgetController.getAssetDetails('WSX', 'CH1', 'img3');
        try {
            CmsAssetWidgetController.saveConfig(k, 'WS1', 'CH1', 'img3');
            System.assert(false);
        } catch (Exception e) {}
        Test.stopTest();

        System.assertEquals(1, found.size());
        System.assertEquals('img2', found[0].id);
        System.assertNotEquals(null, good);
        System.assertEquals('img3', good.id);
        System.assertEquals(null, bad);
    }
}
