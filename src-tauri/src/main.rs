#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    apply_linux_webkit_compat();
    superlabel_lib::run();
}

#[cfg(target_os = "linux")]
fn apply_linux_webkit_compat() {
    set_default_env("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    if std::env::var_os("SUPERLABEL_FORCE_X11").is_some() {
        set_default_env("GDK_BACKEND", "x11");
    }
}

#[cfg(target_os = "linux")]
fn set_default_env(key: &str, value: &str) {
    if std::env::var_os(key).is_none() {
        std::env::set_var(key, value);
    }
}

#[cfg(not(target_os = "linux"))]
fn apply_linux_webkit_compat() {}
