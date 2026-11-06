macro_rules! pack {
    ($id:expr, $light:expr, $($name:literal),+ $(,)?) => {
        match ($id, $light) {
            $(
                ($name, false) => Some(include_bytes!(concat!("../icons/menu/", $name, ".png")) as &'static [u8]),
                ($name, true) => Some(include_bytes!(concat!("../icons/menu/", $name, "-light.png")) as &'static [u8]),
            )+
            _ => None,
        }
    };
}

pub fn bytes(id: &str, light: bool) -> Option<&'static [u8]> {
    pack!(
        id, light, "format", "formbench", "formcad", "formcel", "formcompiler", "formcraft", "formcut", "formdam", "formdeck", "formdesign", "formencoder", "formfabric", "formlit", "formmcp", "formmd",
        "formmorpheus", "formnet", "formpath", "formpdf", "formportal", "formpromo", "formref", "formrig", "formsculpt", "formskills", "formslot", "formsurface", "formtools", "formtray", "formtxt", "formvfx",
        "formvis", "formwav", "formweb", "subform"
    )
}
