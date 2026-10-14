(() => {
  if (window.__decryptedEarlyCryptoJsState) {
    return;
  }

  const originalAesDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "AES");
  const state = {
    candidates: [],
    originalAesDescriptor,
    originalDefineProperty: Object.defineProperty,
    originalDefineProperties: Object.defineProperties,
    aesTrapGetter: null,
    aesTrapSetter: null,
    onCandidate: null,
    restored: false
  };

  const isCryptoJsAes = (value) =>
    value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.encrypt === "function" &&
    typeof value.decrypt === "function";

  const rememberCandidate = (value, discovery) => {
    if (!isCryptoJsAes(value) || state.candidates.some((item) => item.value === value)) {
      return;
    }
    const candidate = { value, discovery };
    state.candidates.push(candidate);
    console.info(
      "[decrypted bootstrap] captured CryptoJS AES candidate",
      discovery,
      location.href
    );
    if (state.onCandidate) {
      state.onCandidate(candidate);
      state.restore();
      if (window.__decryptedEarlyCryptoJsState === state) {
        delete window.__decryptedEarlyCryptoJsState;
      }
    }
  };

  state.restore = () => {
    if (state.restored) {
      return;
    }
    state.restored = true;
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "AES");
    if (
      descriptor?.get === state.aesTrapGetter &&
      descriptor?.set === state.aesTrapSetter
    ) {
      if (state.originalAesDescriptor) {
        Object.defineProperty(Object.prototype, "AES", state.originalAesDescriptor);
      } else {
        delete Object.prototype.AES;
      }
    }
    if (Object.defineProperty === state.definePropertyWrapper) {
      Object.defineProperty = state.originalDefineProperty;
    }
    if (Object.defineProperties === state.definePropertiesWrapper) {
      Object.defineProperties = state.originalDefineProperties;
    }
  };

  state.aesTrapGetter = function earlyAesTrapGetter() {
    return undefined;
  };
  state.aesTrapSetter = function earlyAesTrapSetter(value) {
    Object.defineProperty(this, "AES", {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });

    rememberCandidate(value, "AES property assignment");
  };

  window.__decryptedEarlyCryptoJsState = state;
  if (!originalAesDescriptor) {
    try {
      Object.defineProperty(Object.prototype, "AES", {
        get: state.aesTrapGetter,
        set: state.aesTrapSetter,
        enumerable: false,
        configurable: true
      });
    } catch {}
  }

  state.definePropertyWrapper = function decryptedDefineProperty(target, property, descriptor) {
    let appliedDescriptor = descriptor;
    if (property === "AES" && descriptor?.get) {
      const originalGetter = descriptor.get;
      appliedDescriptor = {
        ...descriptor,
        get() {
          const value = originalGetter.call(this);
          rememberCandidate(value, "Object.defineProperty(AES getter)");
          return value;
        }
      };
    }
    const result = state.originalDefineProperty.call(this, target, property, appliedDescriptor);
    if (property === "AES" && descriptor && "value" in descriptor) {
      rememberCandidate(descriptor.value, "Object.defineProperty(AES value)");
    }
    return result;
  };
  state.definePropertiesWrapper = function decryptedDefineProperties(target, descriptors) {
    let appliedDescriptors = descriptors;
    if (descriptors?.AES?.get) {
      const originalGetter = descriptors.AES.get;
      appliedDescriptors = {
        ...descriptors,
        AES: {
          ...descriptors.AES,
          get() {
            const value = originalGetter.call(this);
            rememberCandidate(value, "Object.defineProperties(AES getter)");
            return value;
          }
        }
      };
    }
    const result = state.originalDefineProperties.call(this, target, appliedDescriptors);
    if (descriptors?.AES && "value" in descriptors.AES) {
      rememberCandidate(descriptors.AES.value, "Object.defineProperties(AES value)");
    }
    return result;
  };

  try {
    Object.defineProperty = state.definePropertyWrapper;
    Object.defineProperties = state.definePropertiesWrapper;
  } catch {}
})();
