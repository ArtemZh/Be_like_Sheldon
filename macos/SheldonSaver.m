//
//  Заставка для macOS: сайт у веб-в'ю просто у вікні заставки.
//
//  У Sonoma й новіших ScreenSaverEngine тримає в'ю заставки так, що WebKit
//  вважає своє вікно закритим іншими вікнами (occlusion) і присипляє
//  сторінку: rAF глухне, воркери сплять, шари не оновлюються. Лікується
//  вимкненням цієї перевірки — приватний, але стабільний виклик, той самий,
//  що використовує WebViewScreenSaver.
//

#import <Cocoa/Cocoa.h>
#import <ScreenSaver/ScreenSaver.h>
#import <WebKit/WebKit.h>

#import "Site.h"

static NSString *const kModuleName = @"ua.zhavrotskyi.sheldonsaver";

// Журнал у файл: NSLog із пісочниці legacyScreenSaver назовні не долітає.
static void SaverLog(NSString *format, ...) {
  va_list args;
  va_start(args, format);
  NSString *line = [[NSString alloc] initWithFormat:format arguments:args];
  va_end(args);
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"sheldon-saver.log"];
  NSString *stamped = [NSString stringWithFormat:@"%@ %@\n", NSDate.date, line];
  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
  if (handle == nil) {
    [stamped writeToFile:path atomically:NO encoding:NSUTF8StringEncoding error:NULL];
    return;
  }
  [handle seekToEndOfFile];
  [handle writeData:[stamped dataUsingEncoding:NSUTF8StringEncoding]];
  [handle closeFile];
}

@interface WKWebView (SheldonPrivate)
- (void)_setWindowOcclusionDetectionEnabled:(BOOL)enabled;
@end

#pragma mark - Налаштування

static ScreenSaverDefaults *Settings(void) {
  ScreenSaverDefaults *defaults = [ScreenSaverDefaults defaultsForModuleWithName:kModuleName];
  [defaults registerDefaults:@{@"speed" : @"real", @"scope" : @"all", @"minutes" : @20}];
  return defaults;
}

#pragma mark - Заставка

@interface SheldonSaverView : ScreenSaverView <WKScriptMessageHandler>
@property(nonatomic, strong) WKWebView *web;
@property(nonatomic, strong) id<NSObject> activity;
@property(nonatomic, strong) NSWindow *sheet;
@property(nonatomic, strong) NSPopUpButton *speedField;
@property(nonatomic, strong) NSPopUpButton *scopeField;
@property(nonatomic, strong) NSSlider *minutesField;
@property(nonatomic, strong) NSTextField *minutesLabel;
@end

@implementation SheldonSaverView

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  if ((self = [super initWithFrame:frame isPreview:isPreview])) {
    self.wantsLayer = YES;
    self.layer.backgroundColor = NSColor.blackColor.CGColor;
    self.animationTimeInterval = 1.0;
  }
  return self;
}

- (void)startAnimation {
  [super startAnimation];
  // Прев'ю в налаштуваннях лишається чорним: 10 МБ фіду заради мініатюри — зайве.
  if (self.isPreview || self.web != nil) return;

  SaverLog(@"старт: bounds=%@ screen=%@", NSStringFromRect(self.bounds),
           NSStringFromSize(self.window.screen.frame.size));

  WKWebView *web = MakeSiteWebView(SiteRoot(self.class), self.bounds);
  web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  if ([web respondsToSelector:@selector(_setWindowOcclusionDetectionEnabled:)]) {
    [web _setWindowOcclusionDetectionEnabled:NO];
    SaverLog(@"occlusion detection вимкнено");
  } else {
    SaverLog(@"_setWindowOcclusionDetectionEnabled: немає в цьому WebKit");
  }

  // Сторінка звітує про стан у журнал: у заставці це єдиний спосіб щось побачити.
  [web.configuration.userContentController addScriptMessageHandler:self name:@"saver"];

  [self addSubview:web];
  self.web = web;

  // App Nap присипляє процес заставки за кілька секунд.
  self.activity = [NSProcessInfo.processInfo
      beginActivityWithOptions:NSActivityUserInitiated | NSActivityIdleDisplaySleepDisabled
                        reason:@"screensaver"];

  NSString *address = SiteAddress(kModuleName);
  SaverLog(@"вантажу %@", address);
  [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:address]]];
}

- (void)stopAnimation {
  [super stopAnimation];
  SaverLog(@"стоп");
  [self.web.configuration.userContentController removeScriptMessageHandlerForName:@"saver"];
  [self.web stopLoading];
  [self.web removeFromSuperview];
  self.web = nil;
  if (self.activity != nil) {
    [NSProcessInfo.processInfo endActivity:self.activity];
    self.activity = nil;
  }
}

- (void)animateOneFrame {
}

- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message {
  SaverLog(@"сторінка: %@", message.body);
}

#pragma mark - Вікно налаштувань

- (BOOL)hasConfigureSheet {
  return YES;
}

- (NSWindow *)configureSheet {
  if (self.sheet != nil) {
    [self loadSettings];
    return self.sheet;
  }

  NSWindow *sheet = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 420, 210)
                                                styleMask:NSWindowStyleMaskTitled
                                                  backing:NSBackingStoreBuffered
                                                    defer:NO];
  NSView *content = sheet.contentView;

  self.speedField = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(150, 150, 240, 25)];
  [self.speedField addItemsWithTitles:@[ @"Реальний час", @"Прискорено" ]];
  [content addSubview:[self labelWithText:@"Час:" atY:153]];
  [content addSubview:self.speedField];

  self.scopeField = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(150, 115, 240, 25)];
  [self.scopeField addItemsWithTitles:@[ @"Уся карта", @"Видима частина" ]];
  [content addSubview:[self labelWithText:@"Показувати:" atY:118]];
  [content addSubview:self.scopeField];

  self.minutesField = [[NSSlider alloc] initWithFrame:NSMakeRect(150, 80, 190, 25)];
  self.minutesField.minValue = 10;
  self.minutesField.maxValue = 60;
  self.minutesField.numberOfTickMarks = 11;
  self.minutesField.allowsTickMarkValuesOnly = YES;
  self.minutesField.target = self;
  self.minutesField.action = @selector(minutesChanged:);
  self.minutesLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(345, 83, 60, 20)];
  self.minutesLabel.editable = NO;
  self.minutesLabel.bordered = NO;
  self.minutesLabel.drawsBackground = NO;
  [content addSubview:[self labelWithText:@"Весь день за:" atY:83]];
  [content addSubview:self.minutesField];
  [content addSubview:self.minutesLabel];

  NSButton *cancel = [NSButton buttonWithTitle:@"Скасувати"
                                        target:self
                                        action:@selector(closeSheet:)];
  cancel.frame = NSMakeRect(200, 20, 100, 32);
  NSButton *save = [NSButton buttonWithTitle:@"Зберегти" target:self action:@selector(saveSheet:)];
  save.frame = NSMakeRect(305, 20, 100, 32);
  save.keyEquivalent = @"\r";
  [content addSubview:cancel];
  [content addSubview:save];

  self.sheet = sheet;
  [self loadSettings];
  return sheet;
}

- (NSTextField *)labelWithText:(NSString *)text atY:(CGFloat)y {
  NSTextField *label = [[NSTextField alloc] initWithFrame:NSMakeRect(20, y, 125, 20)];
  label.stringValue = text;
  label.editable = NO;
  label.bordered = NO;
  label.drawsBackground = NO;
  label.alignment = NSTextAlignmentRight;
  return label;
}

- (void)loadSettings {
  ScreenSaverDefaults *defaults = Settings();
  [self.speedField selectItemAtIndex:[[defaults stringForKey:@"speed"] isEqualToString:@"fast"]];
  [self.scopeField selectItemAtIndex:[[defaults stringForKey:@"scope"] isEqualToString:@"view"]];
  self.minutesField.integerValue = [defaults integerForKey:@"minutes"];
  [self minutesChanged:nil];
}

- (void)minutesChanged:(id)sender {
  self.minutesLabel.stringValue =
      [NSString stringWithFormat:@"%ld хв", (long)self.minutesField.integerValue];
}

- (void)saveSheet:(id)sender {
  ScreenSaverDefaults *defaults = Settings();
  [defaults setObject:self.speedField.indexOfSelectedItem == 1 ? @"fast" : @"real" forKey:@"speed"];
  [defaults setObject:self.scopeField.indexOfSelectedItem == 1 ? @"view" : @"all" forKey:@"scope"];
  [defaults setInteger:self.minutesField.integerValue forKey:@"minutes"];
  [defaults synchronize];
  [self closeSheet:sender];
}

- (void)closeSheet:(id)sender {
  [NSApp endSheet:self.sheet];
}

@end
