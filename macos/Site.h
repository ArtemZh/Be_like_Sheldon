//
//  Спільне для заставки й застосунку-компаньйона: сайт, що лежить усередині
//  бандла, віддається веб-в'ю через власну схему `sheldon://`. З file:// це
//  не працює — WebKit вважає його чужим походженням і забороняє і fetch, і
//  Web Worker, на яких тримається весь застосунок.
//

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

extern NSString *const kSiteScheme;
extern NSString *const kSitePage;

/// Тека `Resources/site` усередині бандла, у якому лежить переданий клас.
NSURL *SiteRoot(Class owner);

/// Веб-в'ю, готове показувати сайт із теки `root`.
WKWebView *MakeSiteWebView(NSURL *root, NSRect frame);

/// Адреса сторінки з налаштуваннями, збереженими для модуля `module`.
NSString *SiteAddress(NSString *module);
