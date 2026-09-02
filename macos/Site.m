#import "Site.h"

#import <ScreenSaver/ScreenSaver.h>

NSString *const kSiteScheme = @"sheldon";
NSString *const kSitePage = @"sheldon://app/index.html?mode=screen&chrome=off";

#pragma mark - Файли сайту замість HTTP-сервера

@interface SiteSchemeHandler : NSObject <WKURLSchemeHandler>
@property(nonatomic, copy) NSURL *root;
@end

@implementation SiteSchemeHandler

- (instancetype)initWithRoot:(NSURL *)root {
  if ((self = [super init])) {
    _root = [root copy];
  }
  return self;
}

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
  // Фід важить 9.7 МБ, і читати його синхронно на головному потоці не можна:
  // поки триває читання, сторінка не встигає створити карту.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    [self serveTask:task];
  });
}

- (void)serveTask:(id<WKURLSchemeTask>)task {
  NSURL *url = task.request.URL;
  NSString *path = url.path;
  if (path.length == 0 || [path isEqualToString:@"/"]) {
    path = @"/index.html";
  }

  NSURL *file = [self.root URLByAppendingPathComponent:[path substringFromIndex:1]];
  NSString *resolved = file.URLByStandardizingPath.path;
  NSString *rootPath = self.root.URLByStandardizingPath.path;

  NSData *data = nil;
  // Ніяких «..»: за межі теки сайту не виходимо.
  if ([resolved hasPrefix:rootPath]) {
    data = [NSData dataWithContentsOfURL:file options:NSDataReadingMappedIfSafe error:NULL];
  }
  if (data == nil) {
    dispatch_async(dispatch_get_main_queue(), ^{
      @try {
        [task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain
                                                   code:NSURLErrorFileDoesNotExist
                                               userInfo:nil]];
      } @catch (NSException *ignored) {
      }
    });
    return;
  }

  // Саме HTTP-відповідь із кодом 200, а не NSURLResponse: fetch і Worker
  // вважають відповідь без статусу помилкою.
  NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc]
      initWithURL:url
       statusCode:200
      HTTPVersion:@"HTTP/1.1"
     headerFields:@{
       @"Content-Type" : [self mimeForExtension:file.pathExtension],
       @"Content-Length" : [@(data.length) stringValue],
       @"Access-Control-Allow-Origin" : @"*",
       @"Cache-Control" : @"no-store",
     }];

  // Віддаємо з головного потоку: WKURLSchemeTask цього вимагає, інакше
  // WebContent зависає й сторінка більше не виконує JS.
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      [task didReceiveResponse:response];
      [task didReceiveData:data];
      [task didFinish];
    } @catch (NSException *ignored) {
      return;  // сторінку закрили, поки ми читали файл
    }
  });
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {
}

- (NSString *)mimeForExtension:(NSString *)ext {
  NSDictionary<NSString *, NSString *> *types = @{
    @"html" : @"text/html",
    @"js" : @"text/javascript",
    @"mjs" : @"text/javascript",
    @"css" : @"text/css",
    @"json" : @"application/json",
    @"webp" : @"image/webp",
    @"png" : @"image/png",
    @"svg" : @"image/svg+xml",
    @"woff2" : @"font/woff2",
  };
  NSString *mime = types[ext.lowercaseString];
  return mime ?: @"application/octet-stream";
}

@end

#pragma mark - Складання

NSURL *SiteRoot(Class owner) {
  return [[NSBundle bundleForClass:owner].resourceURL URLByAppendingPathComponent:@"site"];
}

WKWebView *MakeSiteWebView(NSURL *root, NSRect frame) {
  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  configuration.suppressesIncrementalRendering = NO;
  configuration.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
  if (root != nil) {
    [configuration setURLSchemeHandler:[[SiteSchemeHandler alloc] initWithRoot:root]
                          forURLScheme:kSiteScheme];
  }

  WKWebView *web = [[WKWebView alloc] initWithFrame:frame configuration:configuration];
  [web setValue:@NO forKey:@"drawsBackground"];
  return web;
}

NSArray<NSString *> *SiteLanguages(void) {
  // Ті самі чотири, що й у вебі (`strings.js`).
  return @[ @"uk", @"en", @"de", @"pl" ];
}

NSArray<NSString *> *SiteLanguageNames(void) {
  return @[ @"Українська", @"English", @"Deutsch", @"Polski" ];
}

NSArray<NSString *> *SiteCapitals(void) {
  // Порядок той самий, що й на сторінці (`regions.js`).
  return @[
    @"Berlin", @"Bremen", @"Dresden", @"Düsseldorf", @"Erfurt", @"Hamburg", @"Hannover", @"Kiel",
    @"Magdeburg", @"Mainz", @"München", @"Potsdam", @"Saarbrücken", @"Schwerin", @"Stuttgart",
    @"Wiesbaden"
  ];
}

NSString *SiteAddress(NSString *module, BOOL main) {
  ScreenSaverDefaults *defaults = [ScreenSaverDefaults defaultsForModuleWithName:module];
  // Налаштування міняють у Системних налаштуваннях — це інший процес, і без
  // synchronize заставка читала б власний кеш, тобто старі значення. Саме
  // через це доводилось перевстановлювати бандл, щоб побачити зміну.
  [defaults synchronize];
  [defaults registerDefaults:@{
    @"speed" : @"real",
    @"lang" : @"en",
    @"minutes" : @20,
    @"region" : @"",
    @"board" : @30,
    @"fact" : @22,
    @"pause" : @60,
    @"refresh" : @25,
    @"delay" : @15,
    @"sync" : @NO,
    @"tour" : @45,
  }];
  NSString *custom = [defaults stringForKey:@"url"];
  if (custom.length > 0) {
    return custom;
  }

  NSString *region = [defaults stringForKey:@"region"] ?: @"";
  NSString *address =
      // Охоплення («уся карта / видима частина») лишилось тільки у вебі: у
      // заставці видимої частини не буває, її ніхто не прокручує.
      [NSString stringWithFormat:@"%@&speed=%@&lang=%@&minutes=%ld&board=%ld&fact=%ld&pause=%ld"
                                 @"&tour=%ld&refresh=%ld&delay=%ld&sync=%@&display=%@",
                                 kSitePage, [defaults stringForKey:@"speed"],
                                 [defaults stringForKey:@"lang"],
                                 (long)[defaults integerForKey:@"minutes"],
                                 (long)[defaults integerForKey:@"board"],
                                 (long)[defaults integerForKey:@"fact"],
                                 (long)[defaults integerForKey:@"pause"],
                                 (long)[defaults integerForKey:@"tour"],
                                 (long)[defaults integerForKey:@"refresh"],
                                 (long)[defaults integerForKey:@"delay"],
                                 [defaults boolForKey:@"sync"] ? @"on" : @"off",
                                 main ? @"main" : @"second"];
  if (region.length > 0) {
    NSCharacterSet *allowed = NSCharacterSet.URLQueryAllowedCharacterSet;
    address = [address stringByAppendingFormat:@"&region=%@",
                                               [region stringByAddingPercentEncodingWithAllowedCharacters:allowed]];
  }
  return address;
}
