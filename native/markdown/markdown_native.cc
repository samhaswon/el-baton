#include <napi.h>

extern "C" {
#include "cmark-gfm.h"
#include "cmark-gfm-core-extensions.h"
#include "parser.h"
#include "registry.h"
#include "syntax_extension.h"
}

#include <array>
#include <cctype>
#include <string>
#include <regex>
#include <unordered_map>
#include <vector>

#include "emoji_table.h"

namespace {

int ParseOptions(const Napi::Object& options) {
  int result = CMARK_OPT_DEFAULT;
  const std::array<std::pair<const char*, int>, 11> flags = {{
    {"sourcepos", CMARK_OPT_SOURCEPOS},
    {"hardbreaks", CMARK_OPT_HARDBREAKS},
    {"nobreaks", CMARK_OPT_NOBREAKS},
    {"validateUtf8", CMARK_OPT_VALIDATE_UTF8},
    {"smart", CMARK_OPT_SMART},
    {"githubPreLang", CMARK_OPT_GITHUB_PRE_LANG},
    {"liberalHtmlTag", CMARK_OPT_LIBERAL_HTML_TAG},
    {"footnotes", CMARK_OPT_FOOTNOTES},
    {"strikethroughDoubleTilde", CMARK_OPT_STRIKETHROUGH_DOUBLE_TILDE},
    {"fullInfoString", CMARK_OPT_FULL_INFO_STRING},
    {"unsafe", CMARK_OPT_UNSAFE},
  }};

  for (const auto& [name, flag] : flags) {
    const Napi::Value value = options.Get(name);
    if (!value.IsEmpty() && value.ToBoolean().Value()) result |= flag;
  }

  return result;
}

bool AttachExtensions(const Napi::Object& options, cmark_parser* parser) {
  const Napi::Value value = options.Get("extensions");
  if (value.IsEmpty() || value.IsUndefined() || value.IsNull()) return true;
  if (!value.IsObject()) {
    Napi::TypeError::New(options.Env(), "The 'extensions' property must be an object").ThrowAsJavaScriptException();
    return false;
  }

  const Napi::Object extensions = value.As<Napi::Object>();
  const Napi::Array names = extensions.GetPropertyNames();
  for (uint32_t index = 0; index < names.Length(); ++index) {
    const Napi::Value name_value = names.Get(index);
    if (!name_value.IsString() || !extensions.Get(name_value).ToBoolean().Value()) continue;
    const std::string name = name_value.As<Napi::String>().Utf8Value();
    cmark_syntax_extension* extension = cmark_find_syntax_extension(name.c_str());
    if (extension == nullptr) {
      Napi::Error::New(options.Env(), "Unknown cmark-gfm extension: " + name).ThrowAsJavaScriptException();
      return false;
    }
    cmark_parser_attach_syntax_extension(parser, extension);
  }
  return true;
}

Napi::Value RenderHtmlSync(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const Napi::Object options = (info.Length() > 1 && info[1].IsObject())
    ? info[1].As<Napi::Object>()
    : Napi::Object::New(env);
  const std::string markdown = info[0].As<Napi::String>().Utf8Value();
  const int flags = ParseOptions(options);
  cmark_parser* parser = cmark_parser_new(flags);
  if (parser == nullptr) {
    Napi::Error::New(env, "Unable to allocate cmark-gfm parser").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!AttachExtensions(options, parser)) {
    cmark_parser_free(parser);
    return env.Undefined();
  }

  cmark_parser_feed(parser, markdown.data(), markdown.size());
  cmark_node* document = cmark_parser_finish(parser);
  char* html = cmark_render_html(document, flags, parser->syntax_extensions);
  cmark_node_free(document);
  cmark_parser_free(parser);

  if (html == nullptr) {
    Napi::Error::New(env, "Unable to render markdown").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const Napi::String result = Napi::String::New(env, html);
  free(html);
  return result;
}

Napi::Value RenderCore(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  const Napi::Value html = RenderHtmlSync(info);
  if (env.IsExceptionPending()) return env.Undefined();

  const std::string rendered = html.As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(rendered.size());
  struct Slot { std::string type; size_t math_index; std::string attrs; std::string content; std::string html; };
  std::vector<Slot> slots;

  for (size_t index = 0; index < rendered.size();) {
    constexpr std::string_view kCodeOpen = "<pre><code";
    constexpr std::string_view kCodeClose = "</code></pre>";
    if (rendered.compare(index, kCodeOpen.size(), kCodeOpen) == 0) {
      const size_t code_open_end = rendered.find('>', index + kCodeOpen.size());
      const size_t code_close = code_open_end == std::string::npos ? std::string::npos : rendered.find(kCodeClose, code_open_end + 1);
      if (code_close != std::string::npos) {
        const size_t slot = slots.size();
        const size_t full_end = code_close + kCodeClose.size();
        slots.push_back({"code", 0, rendered.substr(index + kCodeOpen.size(), code_open_end - index - kCodeOpen.size()), rendered.substr(code_open_end + 1, code_close - code_open_end - 1), rendered.substr(index, full_end - index)});
        output += "MDNATIVESLOT" + std::to_string(slot) + "END";
        index = full_end;
        continue;
      }
    }
    constexpr std::string_view kPrefix = "MDKATEXPLACEHOLDER";
    if (rendered.compare(index, kPrefix.size(), kPrefix) != 0) {
      output.push_back(rendered[index++]);
      continue;
    }
    size_t digits = index + kPrefix.size();
    while (digits < rendered.size() && std::isdigit(static_cast<unsigned char>(rendered[digits]))) ++digits;
    if (digits == index + kPrefix.size() || rendered.compare(digits, 3, "END") != 0) {
      output.push_back(rendered[index++]);
      continue;
    }
    const size_t slot = slots.size();
    slots.push_back({"katex", static_cast<size_t>(std::stoull(rendered.substr(index + kPrefix.size(), digits - index - kPrefix.size()))), "", "", ""});
    output += "MDNATIVESLOT" + std::to_string(slot) + "END";
    index = digits + 3;
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("template", output);
  Napi::Array slot_values = Napi::Array::New(env, slots.size());
  for (uint32_t index = 0; index < slots.size(); ++index) {
    Napi::Object slot = Napi::Object::New(env);
    slot.Set("type", slots[index].type);
    if (slots[index].type == "katex") slot.Set("index", static_cast<double>(slots[index].math_index));
    else {
      slot.Set("attrs", slots[index].attrs);
      slot.Set("content", slots[index].content);
      slot.Set("html", slots[index].html);
    }
    slot_values.Set(index, slot);
  }
  result.Set("slots", slot_values);
  return result;
}

Napi::Value Finalize(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected rendered template to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const std::string input = info[0].As<Napi::String>().Utf8Value();
  const Napi::Array slots = (info.Length() > 1 && info[1].IsArray()) ? info[1].As<Napi::Array>() : Napi::Array::New(env);
  std::string output;
  output.reserve(input.size());
  for (size_t index = 0; index < input.size();) {
    constexpr std::string_view kPrefix = "MDNATIVESLOT";
    if (input.compare(index, kPrefix.size(), kPrefix) != 0) {
      output.push_back(input[index++]);
      continue;
    }
    size_t digits = index + kPrefix.size();
    while (digits < input.size() && std::isdigit(static_cast<unsigned char>(input[digits]))) ++digits;
    if (digits == index + kPrefix.size() || input.compare(digits, 3, "END") != 0) {
      output.push_back(input[index++]);
      continue;
    }
    const size_t slot = static_cast<size_t>(std::stoull(input.substr(index + kPrefix.size(), digits - index - kPrefix.size())));
    const Napi::Value replacement = slot < slots.Length() ? slots.Get(static_cast<uint32_t>(slot)) : env.Undefined();
    if (replacement.IsString()) output += replacement.As<Napi::String>().Utf8Value();
    else output.append(input, index, digits + 3 - index);
    index = digits + 3;
  }
  return Napi::String::New(env, output);
}

Napi::Value ReplaceMacroPlaceholders(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());

  for (size_t index = 0; index < input.size();) {
    const size_t remaining = input.size() - index;
    if (remaining >= 8 && input[index] == '[' && input[index + 1] == '[' && input[index + 2] == '@') {
      const size_t close = input.find("]]", index + 3);
      if (close != std::string::npos) {
        std::string name = input.substr(index + 3, close - index - 3);
        for (char& character : name) character = static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
        if (name == "toc") {
          output += "MDMACROTOCPLACEHOLDER";
          index = close + 2;
          continue;
        }
        if (name == "pagebreak") {
          output += "MDMACROPAGEBREAKPLACEHOLDER";
          index = close + 2;
          continue;
        }
      }
    }
    output.push_back(input[index++]);
  }

  return Napi::String::New(env, output);
}

Napi::Value ReplaceEscapedDollars(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const std::string input = info[0].As<Napi::String>().Utf8Value();
  constexpr const char* kPlaceholder = "MDESCAPEDDOLLARPLACEHOLDER";
  std::string output;
  output.reserve(input.size());

  for (size_t index = 0; index < input.size();) {
    if (input[index] == '\\' && (index + 1) < input.size() && input[index + 1] == '$') {
      output += kPlaceholder;
      index += 2;
    } else {
      output.push_back(input[index++]);
    }
  }

  return Napi::String::New(env, output);
}

const std::string_view FindEmoji(const std::string& name) {
  constexpr size_t kMask = markdown_native::kEmojiEntries.size() - 1;
  size_t index = markdown_native::EmojiHash(name) & kMask;
  for (size_t probes = 0; probes < markdown_native::kEmojiEntries.size(); ++probes) {
    const auto& candidate = markdown_native::kEmojiEntries[index];
    if (candidate.name.empty()) return {};
    if (candidate.name == name) return candidate.emoji;
    index = (index + 1) & kMask;
  }
  return {};
}

Napi::Value ReplaceEmojiShortcodes(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  bool in_code = false;
  size_t ticks = 0;
  bool in_fence = false;
  bool fence_line = false;
  char fence_char = 0;
  size_t fence_length = 0;
  bool line_start = true;
  for (size_t index = 0; index < input.size();) {
    if (line_start) {
      size_t marker = index;
      while (marker < input.size() && (input[marker] == ' ' || input[marker] == '\t')) ++marker;
      if (marker < input.size() && (input[marker] == '`' || input[marker] == '~')) {
        size_t end = marker;
        while (end < input.size() && input[end] == input[marker]) ++end;
        const size_t length = end - marker;
        if (!in_fence && length >= 3) {
          in_fence = true;
          fence_char = input[marker];
          fence_length = length;
          fence_line = true;
        } else if (in_fence && input[marker] == fence_char && length >= fence_length) {
          in_fence = false;
          fence_line = true;
        }
      }
    }
    if (in_fence || fence_line) {
      const char character = input[index++];
      output.push_back(character);
      line_start = character == '\n';
      if (line_start) fence_line = false;
      continue;
    }
    if (input[index] == '`') {
      size_t end = index; while (end < input.size() && input[end] == '`') ++end;
      const size_t count = end - index;
      if (!in_code) { in_code = true; ticks = count; }
      else if (count == ticks) { in_code = false; ticks = 0; }
      output.append(input, index, count); index = end; line_start = false; continue;
    }
    if (!in_code && input[index] == ':') {
      size_t end = index + 1;
      while (end < input.size() && (std::isalnum(static_cast<unsigned char>(input[end])) || input[end] == '_' || input[end] == '+' || input[end] == '-')) ++end;
      if (end > index + 1 && end < input.size() && input[end] == ':') {
        std::string name = input.substr(index + 1, end - index - 1);
        for (char& character : name) character = static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
        const std::string_view emoji = FindEmoji(name);
        if (!emoji.empty()) { output.append(emoji); index = end + 1; line_start = false; continue; }
      }
    }
    const char character = input[index++];
    output.push_back(character);
    line_start = character == '\n';
  }
  return Napi::String::New(env, output);
}

Napi::Value ReplaceWikilinks(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 5 || !info[0].IsString() || !info[1].IsString() || !info[2].IsString() || !info[3].IsString() || !info[4].IsString()) {
    Napi::TypeError::New(env, "Expected markdown, token, extension, note regex, and flags").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  const std::string token = info[1].As<Napi::String>().Utf8Value();
  const std::string extension = info[2].As<Napi::String>().Utf8Value();
  const std::string regex_source = info[3].As<Napi::String>().Utf8Value();
  const std::string flags = info[4].As<Napi::String>().Utf8Value();
  const std::regex note_regex(regex_source, flags.find('i') != std::string::npos ? std::regex::icase : std::regex::ECMAScript);
  std::string output;
  output.reserve(input.size());
  bool in_code = false;
  size_t ticks = 0;
  bool in_fence = false, fence_line = false, line_start = true;
  char fence_char = 0;
  size_t fence_length = 0;
  for (size_t index = 0; index < input.size();) {
    if (line_start) {
      size_t marker = index; while (marker < input.size() && (input[marker] == ' ' || input[marker] == '\t')) ++marker;
      if (marker < input.size() && (input[marker] == '`' || input[marker] == '~')) {
        size_t end = marker; while (end < input.size() && input[end] == input[marker]) ++end;
        if (!in_fence && end - marker >= 3) { in_fence = true; fence_char = input[marker]; fence_length = end - marker; fence_line = true; }
        else if (in_fence && input[marker] == fence_char && end - marker >= fence_length) { in_fence = false; fence_line = true; }
      }
    }
    if (in_fence || fence_line) { const char character = input[index++]; output.push_back(character); line_start = character == '\n'; if (line_start) fence_line = false; continue; }
    if (input[index] == '`') { size_t end = index; while (end < input.size() && input[end] == '`') ++end; const size_t count = end - index; if (!in_code) { in_code = true; ticks = count; } else if (count == ticks) { in_code = false; ticks = 0; } output.append(input, index, count); index = end; line_start = false; continue; }
    if (!in_code && input.compare(index, 2, "[[") == 0) {
      const size_t close = input.find("]]", index + 2);
      if (close != std::string::npos) {
        const std::string inner = input.substr(index + 2, close - index - 2);
        const size_t separator = inner.find('|');
        const std::string title = inner.substr(0, separator);
        const std::string note = separator == std::string::npos ? title : inner.substr(separator + 1);
        if (!title.empty() && !note.empty()) {
          output += "<a href=\"" + token + "/" + note + (std::regex_search(note, note_regex) ? "" : extension) + "\">" + title + "</a>";
          index = close + 2;
          line_start = false;
          continue;
        }
      }
    }
    const char character = input[index++]; output.push_back(character); line_start = character == '\n';
  }
  return Napi::String::New(env, output);
}

bool IsEncodeUriSafe(unsigned char character) {
  return std::isalnum(character) || character == '-' || character == '_' || character == '.' || character == '!' ||
    character == '~' || character == '*' || character == '\'' || character == '(' || character == ')' ||
    character == ';' || character == ',' || character == '/' || character == '?' || character == ':' || character == '@' ||
    character == '&' || character == '=' || character == '+' || character == '$' || character == '#';
}

std::string EncodeFileTokenPath(const std::string& value) {
  constexpr char kHex[] = "0123456789ABCDEF";
  std::string output;
  output.reserve(value.size());
  for (const unsigned char character : value) {
    if (character == '\\') { output.push_back('/'); continue; }
    if (IsEncodeUriSafe(character)) { output.push_back(static_cast<char>(character)); continue; }
    output += '%';
    output += kHex[character >> 4];
    output += kHex[character & 0x0f];
  }
  return output;
}

Napi::Value EncodeSpecialLinks(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() || !info[2].IsString() || !info[3].IsString()) {
    Napi::TypeError::New(env, "Expected markdown and token strings").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  const std::array<std::string, 3> tokens = {{
    info[1].As<Napi::String>().Utf8Value(), info[2].As<Napi::String>().Utf8Value(), info[3].As<Napi::String>().Utf8Value()
  }};
  std::string output;
  output.reserve(input.size());
  bool in_code = false, in_fence = false, fence_line = false, line_start = true;
  size_t ticks = 0, fence_length = 0;
  char fence_char = 0;
  for (size_t index = 0; index < input.size();) {
    if (line_start) {
      size_t marker = index; while (marker < input.size() && (input[marker] == ' ' || input[marker] == '\t')) ++marker;
      if (marker < input.size() && (input[marker] == '`' || input[marker] == '~')) {
        size_t end = marker; while (end < input.size() && input[end] == input[marker]) ++end;
        if (!in_fence && end - marker >= 3) { in_fence = true; fence_char = input[marker]; fence_length = end - marker; fence_line = true; }
        else if (in_fence && input[marker] == fence_char && end - marker >= fence_length) { in_fence = false; fence_line = true; }
      }
    }
    if (in_fence || fence_line) { const char character = input[index++]; output.push_back(character); line_start = character == '\n'; if (line_start) fence_line = false; continue; }
    if (input[index] == '`') { size_t end = index; while (end < input.size() && input[end] == '`') ++end; const size_t count = end - index; if (!in_code) { in_code = true; ticks = count; } else if (count == ticks) { in_code = false; ticks = 0; } output.append(input, index, count); index = end; line_start = false; continue; }
    if (!in_code && input[index] == '[') {
      const size_t label_end = input.find("](", index + 1);
      const size_t target_end = label_end == std::string::npos ? std::string::npos : input.find(')', label_end + 2);
      if (target_end != std::string::npos) {
        const std::string target = input.substr(label_end + 2, target_end - label_end - 2);
        bool special = false;
        for (const std::string& token : tokens) {
          if (!token.empty() && target.rfind(token + "/", 0) == 0) { special = true; break; }
        }
        if (special) {
          output.append(input, index, label_end + 2 - index);
          output += EncodeFileTokenPath(target);
          output.push_back(')');
          index = target_end + 1;
          line_start = false;
          continue;
        }
      }
    }
    const char character = input[index++]; output.push_back(character); line_start = character == '\n';
  }
  return Napi::String::New(env, output);
}

Napi::Value ReplaceSuperscriptSubscript(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  for (size_t index = 0; index < input.size();) {
    const char marker = input[index];
    const bool superscript = marker == '^';
    const bool subscript = marker == '~' && (index + 1 >= input.size() || input[index + 1] != '~');
    const bool escaped = index > 0 && input[index - 1] == '\\';
    const bool doubled = index > 0 && input[index - 1] == marker;
    if ((!superscript && !subscript) || escaped || doubled) { output.push_back(input[index++]); continue; }
    size_t end = index + 1;
    while (end < input.size() && input[end] != marker && input[end] != '\n') ++end;
    if (end >= input.size() || input[end] != marker || end == index + 1 || std::isspace(static_cast<unsigned char>(input[index + 1])) || std::isspace(static_cast<unsigned char>(input[end - 1]))) { output.push_back(input[index++]); continue; }
    if (superscript && index > 0 && input[index - 1] == '^') { output.push_back(input[index++]); continue; }
    output += superscript ? "<sup>" : "<sub>";
    output.append(input, index + 1, end - index - 1);
    output += superscript ? "</sup>" : "</sub>";
    index = end + 1;
  }
  return Napi::String::New(env, output);
}

bool IsEscaped(const std::string& value, size_t index) {
  size_t count = 0;
  while (index > 0 && value[--index] == '\\') ++count;
  return (count % 2) == 1;
}

Napi::Value ExtractMathDelimiters(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  struct Payload { std::string tex; bool display; };
  std::vector<Payload> payloads;
  for (size_t index = 0; index < input.size();) {
    if (input[index] != '$' || IsEscaped(input, index)) { output.push_back(input[index++]); continue; }
    const bool display = index + 1 < input.size() && input[index + 1] == '$';
    const size_t delimiter = display ? 2 : 1;
    size_t close = index + delimiter;
    for (; close < input.size(); ++close) {
      if (!display && input[close] == '\n') break;
      if (input[close] != '$' || IsEscaped(input, close)) continue;
      if (display) { if (close + 1 < input.size() && input[close + 1] == '$') break; }
      else if ((close == 0 || input[close - 1] != '$') && (close + 1 == input.size() || input[close + 1] != '$')) break;
    }
    if (close >= input.size() || (!display && (input[close] != '$' || input[close] == '\n')) || (display && (close + 1 >= input.size() || input[close + 1] != '$'))) { output.push_back(input[index++]); continue; }
    const std::string tex = input.substr(index + delimiter, close - index - delimiter);
    if (tex.empty()) { output.append(input, index, close + delimiter - index); index = close + delimiter; continue; }
    const size_t slot = payloads.size();
    payloads.push_back({tex, display});
    output += "MDKATEXPLACEHOLDER" + std::to_string(slot) + "END";
    index = close + delimiter;
  }
  Napi::Object result = Napi::Object::New(env);
  result.Set("text", output);
  Napi::Array math = Napi::Array::New(env, payloads.size());
  for (uint32_t index = 0; index < payloads.size(); ++index) {
    Napi::Object payload = Napi::Object::New(env);
    payload.Set("tex", payloads[index].tex);
    payload.Set("displayMode", payloads[index].display);
    math.Set(index, payload);
  }
  result.Set("math", math);
  return result;
}

Napi::Value NumberCheckboxes(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  size_t offset = 0, nth = 0;
  constexpr std::string_view kStart = "<input type=\"checkbox\"";
  while (offset < input.size()) {
    const size_t start = input.find(kStart, offset);
    if (start == std::string::npos) { output.append(input, offset, std::string::npos); break; }
    const size_t end = input.find('>', start);
    if (end == std::string::npos) { output.append(input, offset, std::string::npos); break; }
    std::string tag = input.substr(offset, end - offset);
    size_t disabled = tag.find(" disabled=\"");
    if (disabled != std::string::npos) {
      const size_t value_end = tag.find('"', disabled + 11);
      if (value_end != std::string::npos) tag.erase(disabled, value_end - disabled + 1);
    } else if ((disabled = tag.find(" disabled")) != std::string::npos) {
      tag.erase(disabled, 9);
    }
    const size_t task_item = tag.rfind("<li><input type=\"checkbox\"");
    if (task_item != std::string::npos) tag.replace(task_item, 4, "<li class=\"task-list-item\">");
    while (!tag.empty() && std::isspace(static_cast<unsigned char>(tag.back()))) tag.pop_back();
    const bool self_closing = !tag.empty() && tag.back() == '/';
    if (self_closing) tag.pop_back();
    while (!tag.empty() && std::isspace(static_cast<unsigned char>(tag.back()))) tag.pop_back();
    output += tag;
    output += " data-nth=\"" + std::to_string(nth++) + "\"";
    if (self_closing) output += " /";
    output.push_back('>');
    offset = end + 1;
  }
  return Napi::String::New(env, output);
}

Napi::Value AddBlankTargets(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  size_t offset = 0;
  while (offset < input.size()) {
    const size_t start = input.find("<a", offset);
    if (start == std::string::npos) { output.append(input, offset, std::string::npos); break; }
    const size_t end = input.find('>', start);
    const size_t href = input.find("href=\"", start);
    if (end == std::string::npos || href == std::string::npos || href > end) { output.append(input, offset, end == std::string::npos ? std::string::npos : end + 1 - offset); offset = end == std::string::npos ? input.size() : end + 1; continue; }
    const size_t value_start = href + 6;
    const size_t value_end = input.find('"', value_start);
    if (value_end == std::string::npos || value_end > end || (value_start < input.size() && input[value_start] == '#')) { output.append(input, offset, end + 1 - offset); offset = end + 1; continue; }
    output.append(input, offset, href - offset);
    output += "target=\"_blank\" ";
    output.append(input, href, end + 1 - href);
    offset = end + 1;
  }
  return Napi::String::New(env, output);
}

bool HasProtocol(const std::string& value) {
  if (value.size() >= 2 && value[0] == '/' && value[1] == '/') return true;
  if (value.empty() || !std::isalpha(static_cast<unsigned char>(value[0]))) return false;
  for (size_t index = 1; index < value.size(); ++index) {
    const unsigned char character = static_cast<unsigned char>(value[index]);
    if (value[index] == ':') return true;
    if (!std::isalnum(character) && value[index] != '+' && value[index] != '-' && value[index] != '.') return false;
  }
  return false;
}

Napi::Value NormalizeLinkProtocols(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  size_t offset = 0;
  while (offset < input.size()) {
    const size_t start = input.find("<a", offset);
    if (start == std::string::npos) { output.append(input, offset, std::string::npos); break; }
    const size_t end = input.find('>', start), href = input.find("href=\"", start);
    if (end == std::string::npos || href == std::string::npos || href > end) { output.append(input, offset, end == std::string::npos ? std::string::npos : end + 1 - offset); offset = end == std::string::npos ? input.size() : end + 1; continue; }
    const size_t value_start = href + 6, value_end = input.find('"', value_start);
    if (value_end == std::string::npos || value_end > end) { output.append(input, offset, end + 1 - offset); offset = end + 1; continue; }
    const std::string value = input.substr(value_start, value_end - value_start);
    output.append(input, offset, value_start - offset);
    if (!value.empty() && value[0] != '#' && !HasProtocol(value)) output += "https://";
    output += value;
    output.append(input, value_end, end + 1 - value_end);
    offset = end + 1;
  }
  return Napi::String::New(env, output);
}

Napi::Value WrapCodeBlocks(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string output;
  output.reserve(input.size());
  size_t offset = 0;
  constexpr std::string_view kOpen = "<pre><code";
  constexpr std::string_view kClose = "</code></pre>";
  constexpr std::string_view kWrapper = "<div class=\"copy-wrapper\"><div class=\"copy\" title=\"Copy code to clipboard\"><i class=\"icon small\">content_copy</i></div>";
  while (offset < input.size()) {
    const size_t start = input.find(kOpen, offset);
    if (start == std::string::npos) { output.append(input, offset, std::string::npos); break; }
    const size_t end = input.find(kClose, start);
    if (end == std::string::npos) { output.append(input, offset, std::string::npos); break; }
    output.append(input, offset, start - offset);
    output.append(kWrapper);
    output.append(input, start, end + kClose.size() - start);
    output += "</div>";
    offset = end + kClose.size();
  }
  return Napi::String::New(env, output);
}

void ReplaceAll(std::string* value, std::string_view needle, std::string_view replacement) {
  size_t offset = 0;
  while ((offset = value->find(needle, offset)) != std::string::npos) {
    value->replace(offset, needle.size(), replacement);
    offset += replacement.size();
  }
}

Napi::Value InjectDiagramControls(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string output = info[0].As<Napi::String>().Utf8Value();
  ReplaceAll(&output, "<div class=\"mermaid\">", "<div class=\"mermaid\"><div class=\"mermaid-open-external\" title=\"Open in Separate Window\"><i class=\"icon small\">open_in_new</i></div>");
  ReplaceAll(&output, "<div class=\"plantuml\">", "<div class=\"plantuml\"><div class=\"plantuml-open-external hidden\" title=\"Open External Diagram\"><i class=\"icon small\">open_in_new</i></div>");
  return Napi::String::New(env, output);
}

void AppendUtf8(std::string* output, uint32_t codepoint) {
  if (codepoint <= 0x7f) {
    output->push_back(static_cast<char>(codepoint));
  } else if (codepoint <= 0x7ff) {
    output->push_back(static_cast<char>(0xc0 | (codepoint >> 6)));
    output->push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  } else if (codepoint <= 0xffff) {
    output->push_back(static_cast<char>(0xe0 | (codepoint >> 12)));
    output->push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
    output->push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  } else if (codepoint <= 0x10ffff) {
    output->push_back(static_cast<char>(0xf0 | (codepoint >> 18)));
    output->push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3f)));
    output->push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
    output->push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  }
}

int DigitValue(char character) {
  if (character >= '0' && character <= '9') return character - '0';
  if (character >= 'a' && character <= 'f') return character - 'a' + 10;
  if (character >= 'A' && character <= 'F') return character - 'A' + 10;
  return -1;
}

// This decoder only needs to recognize entities which can conceal a URL
// protocol. Unknown entities are intentionally left untouched; browsers do
// the same for malformed/unknown values, and the JavaScript backstop remains
// active until native sanitization is the sole policy implementation.
std::string DecodeHtmlEntitiesForUrl(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  for (size_t index = 0; index < input.size();) {
    if (input[index] != '&') {
      output.push_back(input[index++]);
      continue;
    }
    const size_t semicolon = input.find(';', index + 1);
    if (semicolon == std::string::npos || semicolon - index > 16) {
      output.push_back(input[index++]);
      continue;
    }
    const std::string entity = input.substr(index + 1, semicolon - index - 1);
    uint32_t value = 0;
    bool decoded = false;
    if (entity.size() > 1 && entity[0] == '#') {
      const bool hexadecimal = entity.size() > 2 && (entity[1] == 'x' || entity[1] == 'X');
      const size_t first_digit = hexadecimal ? 2 : 1;
      const int base = hexadecimal ? 16 : 10;
      if (first_digit < entity.size()) {
        decoded = true;
        for (size_t digit = first_digit; digit < entity.size(); ++digit) {
          const int parsed = DigitValue(entity[digit]);
          if (parsed < 0 || parsed >= base || value > 0x10ffffu / static_cast<uint32_t>(base)) {
            decoded = false;
            break;
          }
          value = value * base + static_cast<uint32_t>(parsed);
        }
        decoded = decoded && value <= 0x10ffff;
      }
    } else if (entity == "amp") { value = '&'; decoded = true; }
    else if (entity == "colon") { value = ':'; decoded = true; }
    else if (entity == "tab" || entity == "Tab") { value = '\t'; decoded = true; }
    else if (entity == "newline" || entity == "NewLine") { value = '\n'; decoded = true; }
    else if (entity == "nbsp") { value = 0xa0; decoded = true; }

    if (!decoded) {
      output.push_back(input[index++]);
      continue;
    }
    AppendUtf8(&output, value);
    index = semicolon + 1;
  }
  return output;
}

std::string DecodePercentEscapes(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  for (size_t index = 0; index < input.size();) {
    if (input[index] == '%' && index + 2 < input.size()) {
      const int high = DigitValue(input[index + 1]), low = DigitValue(input[index + 2]);
      if (high >= 0 && low >= 0) {
        output.push_back(static_cast<char>((high << 4) | low));
        index += 3;
        continue;
      }
    }
    output.push_back(input[index++]);
  }
  return output;
}

bool IsUnsafeUrlProtocol(const std::string& raw_value) {
  std::string decoded = raw_value;
  for (int index = 0; index < 3; ++index) {
    const std::string next = DecodeHtmlEntitiesForUrl(decoded);
    if (next == decoded) break;
    decoded = next;
  }
  for (int index = 0; index < 3; ++index) {
    if (decoded.find('%') == std::string::npos) break;
    const std::string next = DecodePercentEscapes(decoded);
    if (next == decoded) break;
    decoded = next;
  }

  std::string normalized;
  normalized.reserve(decoded.size());
  for (const unsigned char character : decoded) {
    if (character <= 0x20 || character == 0x7f) continue;
    normalized.push_back(static_cast<char>(std::tolower(character)));
  }
  if (normalized.rfind("javascript:", 0) == 0 || normalized.rfind("vbscript:", 0) == 0) return true;
  return normalized.rfind("data:", 0) == 0 &&
    !(normalized.rfind("data:image/png;", 0) == 0 || normalized.rfind("data:image/gif;", 0) == 0 ||
      normalized.rfind("data:image/jpeg;", 0) == 0 || normalized.rfind("data:image/webp;", 0) == 0);
}

std::string StripUnsafeUrlAttributes(const std::string& input) {
  static const std::regex attributes(
    "\\s+(href|src|xlink:href|action|formaction|poster)\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s>]+))",
    std::regex::icase
  );
  std::string output;
  output.reserve(input.size());
  size_t offset = 0;
  for (std::sregex_iterator match(input.begin(), input.end(), attributes), end; match != end; ++match) {
    const std::smatch& current = *match;
    output.append(input, offset, static_cast<size_t>(current.position()) - offset);
    const std::string value = current[2].matched ? current[2].str() : current[3].matched ? current[3].str() : current[4].str();
    if (!IsUnsafeUrlProtocol(value)) output += current.str();
    offset = static_cast<size_t>(current.position() + current.length());
  }
  output.append(input, offset, std::string::npos);
  return output;
}

std::string DecodeHtmlEntities(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  for (size_t index = 0; index < input.size();) {
    if (input[index] != '&') {
      output.push_back(input[index++]);
      continue;
    }
    const size_t semicolon = input.find(';', index + 1);
    if (semicolon == std::string::npos || semicolon - index > 16) {
      output.push_back(input[index++]);
      continue;
    }
    const std::string entity = input.substr(index + 1, semicolon - index - 1);
    uint32_t value = 0;
    bool decoded = false;
    if (entity.size() > 1 && entity[0] == '#') {
      const bool hexadecimal = entity.size() > 2 && (entity[1] == 'x' || entity[1] == 'X');
      const size_t first_digit = hexadecimal ? 2 : 1;
      const int base = hexadecimal ? 16 : 10;
      if (first_digit < entity.size()) {
        decoded = true;
        for (size_t digit = first_digit; digit < entity.size(); ++digit) {
          const int parsed = DigitValue(entity[digit]);
          if (parsed < 0 || parsed >= base || value > 0x10ffffu / static_cast<uint32_t>(base)) {
            decoded = false;
            break;
          }
          value = value * base + static_cast<uint32_t>(parsed);
        }
        decoded = decoded && value <= 0x10ffff;
      }
    } else if (entity == "amp") { value = '&'; decoded = true; }
    else if (entity == "lt") { value = '<'; decoded = true; }
    else if (entity == "gt") { value = '>'; decoded = true; }
    else if (entity == "quot") { value = '"'; decoded = true; }
    else if (entity == "apos") { value = '\''; decoded = true; }
    if (!decoded) {
      output.push_back(input[index++]);
      continue;
    }
    AppendUtf8(&output, value);
    index = semicolon + 1;
  }
  return output;
}

std::string StripHtml(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  bool in_tag = false, pending_space = false;
  for (const unsigned char character : input) {
    if (character == '<') { in_tag = true; continue; }
    if (character == '>' && in_tag) { in_tag = false; continue; }
    if (in_tag) continue;
    if (std::isspace(character)) { pending_space = !output.empty(); continue; }
    if (pending_space) { output.push_back(' '); pending_space = false; }
    output.push_back(static_cast<char>(character));
  }
  return DecodeHtmlEntities(output);
}

std::string EscapeHtml(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  for (const char character : input) {
    switch (character) {
      case '&': output += "&amp;"; break;
      case '<': output += "&lt;"; break;
      case '>': output += "&gt;"; break;
      case '"': output += "&quot;"; break;
      case '\'': output += "&#39;"; break;
      default: output.push_back(character); break;
    }
  }
  return output;
}

std::string SlugifyHeading(const std::string& text, std::unordered_map<std::string, size_t>* counts) {
  std::string base;
  base.reserve(text.size());
  bool last_space = false;
  for (const unsigned char character : text) {
    if (std::isalnum(character)) {
      base.push_back(static_cast<char>(std::tolower(character)));
      last_space = false;
    } else if (character == '-') {
      base.push_back('-');
      last_space = false;
    } else if (std::isspace(character)) {
      if (!base.empty() && !last_space) { base.push_back('-'); last_space = true; }
    }
  }
  while (!base.empty() && base.back() == '-') base.pop_back();
  if (base.empty()) base = "section";
  const size_t count = ++(*counts)[base];
  return count == 1 ? base : base + "-" + std::to_string(count);
}

struct Heading { std::string id; int level; std::string text; };

std::string RenderMacroToc(const std::vector<Heading>& headings) {
  if (headings.empty()) return "";
  std::string output = "<div class=\"macro-toc\"><p class=\"macro-toc-title\">Table of Contents</p>";
  std::vector<int> open_levels;
  for (const Heading& heading : headings) {
    if (open_levels.empty()) {
      output += "<ul class=\"macro-toc-list\">";
      open_levels.push_back(heading.level);
    } else if (heading.level > open_levels.back()) {
      output += "<ul class=\"macro-toc-list\">";
      open_levels.push_back(heading.level);
    } else {
      while (!open_levels.empty() && heading.level < open_levels.back()) {
        output += "</li></ul>";
        open_levels.pop_back();
      }
      if (!open_levels.empty()) {
        output += "</li>";
      } else {
        output += "<ul class=\"macro-toc-list\">";
        open_levels.push_back(heading.level);
      }
    }
    output += "<li><a class=\"toc-item\" href=\"#" + heading.id + "\">" + EscapeHtml(heading.text) + "</a>";
  }
  if (!open_levels.empty()) output += "</li>";
  while (!open_levels.empty()) { output += "</ul>"; open_levels.pop_back(); }
  return output + "</div>";
}

Napi::Value RenderMacros(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html to be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string input = info[0].As<Napi::String>().Utf8Value();
  static const std::regex headings("<h([1-6])(\\s[^>]*)?>([\\s\\S]*?)</h\\1>", std::regex::icase);
  static const std::regex existing_id("\\sid=\\\"([^\\\"]+)\\\"", std::regex::icase);
  std::unordered_map<std::string, size_t> slug_counts;
  std::vector<Heading> collected;
  std::string with_anchors;
  with_anchors.reserve(input.size());
  size_t offset = 0;
  for (std::sregex_iterator match(input.begin(), input.end(), headings), end; match != end; ++match) {
    const std::smatch& current = *match;
    with_anchors.append(input, offset, static_cast<size_t>(current.position()) - offset);
    const int level = std::stoi(current[1].str());
    const std::string attrs = current[2].matched ? current[2].str() : "";
    const std::string inner_html = current[3].str();
    const std::string text = StripHtml(inner_html);
    if (text.empty()) {
      with_anchors += current.str();
    } else {
      std::smatch id_match;
      const bool has_id = std::regex_search(attrs, id_match, existing_id);
      const std::string id = has_id ? id_match[1].str() : SlugifyHeading(text, &slug_counts);
      collected.push_back({id, level, text});
      with_anchors += "<h" + std::to_string(level) + attrs + (has_id ? "" : " id=\"" + id + "\"") + ">" + inner_html + "</h" + std::to_string(level) + ">";
    }
    offset = static_cast<size_t>(current.position() + current.length());
  }
  with_anchors.append(input, offset, std::string::npos);
  ReplaceAll(&with_anchors, "<p>MDMACROTOCPLACEHOLDER</p>", RenderMacroToc(collected));
  ReplaceAll(&with_anchors, "<p>MDMACROPAGEBREAKPLACEHOLDER</p>", "<hr class=\"pagebreak\">");
  return Napi::String::New(env, with_anchors);
}

Napi::Value SanitizeStaticHtml(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected html and enabled flag").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (!info[1].ToBoolean().Value()) return info[0];
  std::string output = info[0].As<Napi::String>().Utf8Value();
  const std::regex blocked("<(script|style|title|textarea|xmp|noembed|noframes|plaintext)\\b[^>]*>[\\s\\S]*?</\\1\\s*>", std::regex::icase);
  const std::regex orphaned("</?(script|style|title|textarea|xmp|noembed|noframes|plaintext)\\b[^>]*>", std::regex::icase);
  const std::regex events("\\s+on[a-z]+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", std::regex::icase);
  const std::regex srcdoc("\\s+srcdoc\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", std::regex::icase);
  output = std::regex_replace(output, blocked, "");
  output = std::regex_replace(output, orphaned, "");
  output = std::regex_replace(output, events, "");
  output = std::regex_replace(output, srcdoc, "");
  output = StripUnsafeUrlAttributes(output);
  return Napi::String::New(env, output);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  cmark_gfm_core_extensions_ensure_registered();
  exports.Set("renderHtmlSync", Napi::Function::New(env, RenderHtmlSync));
  exports.Set("renderCore", Napi::Function::New(env, RenderCore));
  exports.Set("finalize", Napi::Function::New(env, Finalize));
  exports.Set("replaceMacroPlaceholders", Napi::Function::New(env, ReplaceMacroPlaceholders));
  exports.Set("replaceEscapedDollars", Napi::Function::New(env, ReplaceEscapedDollars));
  exports.Set("replaceEmojiShortcodes", Napi::Function::New(env, ReplaceEmojiShortcodes));
  exports.Set("replaceWikilinks", Napi::Function::New(env, ReplaceWikilinks));
  exports.Set("encodeSpecialLinks", Napi::Function::New(env, EncodeSpecialLinks));
  exports.Set("replaceSuperscriptSubscript", Napi::Function::New(env, ReplaceSuperscriptSubscript));
  exports.Set("extractMathDelimiters", Napi::Function::New(env, ExtractMathDelimiters));
  exports.Set("numberCheckboxes", Napi::Function::New(env, NumberCheckboxes));
  exports.Set("addBlankTargets", Napi::Function::New(env, AddBlankTargets));
  exports.Set("normalizeLinkProtocols", Napi::Function::New(env, NormalizeLinkProtocols));
  exports.Set("wrapCodeBlocks", Napi::Function::New(env, WrapCodeBlocks));
  exports.Set("injectDiagramControls", Napi::Function::New(env, InjectDiagramControls));
  exports.Set("renderMacros", Napi::Function::New(env, RenderMacros));
  exports.Set("sanitizeStaticHtml", Napi::Function::New(env, SanitizeStaticHtml));
  exports.Set("version", Napi::String::New(env, cmark_version_string()));
  return exports;
}

} // namespace

NODE_API_MODULE(markdown_native, Init)
