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

NSString *SiteAddress(NSString *module) {
  ScreenSaverDefaults *defaults = [ScreenSaverDefaults defaultsForModuleWithName:module];
  [defaults registerDefaults:@{@"speed" : @"real", @"scope" : @"all", @"minutes" : @20}];
  NSString *custom = [defaults stringForKey:@"url"];
  if (custom.length > 0) {
    return custom;
  }
  return [NSString stringWithFormat:@"%@&speed=%@&scope=%@&minutes=%ld", kSitePage,
                                    [defaults stringForKey:@"speed"],
                                    [defaults stringForKey:@"scope"],
                                    (long)[defaults integerForKey:@"minutes"]];
}
