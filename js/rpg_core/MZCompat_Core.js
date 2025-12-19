//-----------------------------------------------------------------------------
// MZCompat_Core
//
// A minimal compatibility layer that backfills selected MZ APIs on top of the
// MV-first engine. All patches are opt-in and guarded to avoid changing MV
// behavior while allowing MZ plugins/features to run.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utils helpers (MZ additions)
  if (typeof Utils !== "undefined") {
    if (Utils.canUseCssFontLoading == null) {
      Utils.canUseCssFontLoading = function () {
        return typeof document !== "undefined" && !!document.fonts;
      };
    }

    if (Utils.canUseIndexedDB == null) {
      Utils.canUseIndexedDB = function () {
        return typeof indexedDB !== "undefined";
      };
    }

    if (Utils.canUseWebAudioAPI == null) {
      Utils.canUseWebAudioAPI = function () {
        return !!(window.AudioContext || window.webkitAudioContext);
      };
    }

    if (Utils.canUseWebGL == null) {
      Utils.canUseWebGL = function () {
        try {
          return !!document.createElement("canvas").getContext("webgl");
        } catch (e) {
          return false;
        }
      };
    }

    if (Utils.canPlayOgg == null) {
      Utils.canPlayOgg = function () {
        var audio = document.createElement("audio");
        return !!audio.canPlayType && audio.canPlayType("audio/ogg") !== "";
      };
    }

    if (Utils.canPlayWebm == null) {
      Utils.canPlayWebm = function () {
        var video = document.createElement("video");
        return !!video.canPlayType && video.canPlayType("video/webm") !== "";
      };
    }

    if (Utils.isLocal == null) {
      Utils.isLocal = function () {
        return location.protocol === "file:";
      };
    }

    if (Utils.containsArabic == null) {
      Utils.containsArabic = function (str) {
        return /[\u0600-\u06FF]/.test(str || "");
      };
    }

    if (Utils.checkRMVersion == null) {
      Utils.checkRMVersion = function (version) {
        if (!version) return false;
        var current = (Utils.RPGMAKER_VERSION || "0.0.0").split(".");
        var target = String(version).split(".");
        while (current.length < 3) current.push("0");
        while (target.length < 3) target.push("0");
        for (var i = 0; i < 3; i++) {
          var a = parseInt(current[i], 10);
          var b = parseInt(target[i], 10);
          if (a !== b) return a > b;
        }
        return true;
      };
    }

    if (Utils.setEncryptionInfo == null) {
      Utils.setEncryptionInfo = function (info) {
        if (!info) return;
        if (typeof Decrypter !== "undefined") {
          if (info.hasOwnProperty("hasEncryptedAudio")) {
            Decrypter.hasEncryptedAudio = !!info.hasEncryptedAudio;
          }
          if (info.hasOwnProperty("hasEncryptedImages")) {
            Decrypter.hasEncryptedImages = !!info.hasEncryptedImages;
          }
          if (info.hasOwnProperty("encryptionKey")) {
            Decrypter._encryptionKey = info.encryptionKey || "";
          }
        }
      };
    }

    if (Utils.hasEncryptedAudio == null) {
      Utils.hasEncryptedAudio = function () {
        return typeof Decrypter !== "undefined" && !!Decrypter.hasEncryptedAudio;
      };
    }

    if (Utils.hasEncryptedImages == null) {
      Utils.hasEncryptedImages = function () {
        return typeof Decrypter !== "undefined" && !!Decrypter.hasEncryptedImages;
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Array helpers (MZ additions)
  if (Array.prototype.remove == null) {
    Object.defineProperty(Array.prototype, "remove", {
      value: function (element) {
        var index = this.indexOf(element);
        if (index >= 0) {
          this.splice(index, 1);
          return true;
        }
        return false;
      },
      writable: true,
      configurable: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Input virtual button hook (MZ)
  if (typeof Input !== "undefined" && !Input.virtualClick) {
    var _Input_clear = Input.clear;
    Input.clear = function () {
      _Input_clear.call(this);
      this._virtualButton = null;
    };

    Input.virtualClick = function (buttonName) {
      this._virtualButton = buttonName;
    };

    var _Input_update = Input.update;
    Input.update = function () {
      _Input_update.call(this);
      if (this._virtualButton) {
        this._latestButton = this._virtualButton;
        this._pressedTime = 0;
        this._virtualButton = null;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // TouchInput helpers (MZ shims)
  if (typeof TouchInput !== "undefined") {
    if (!TouchInput._createNewState) {
      TouchInput._createNewState = function () {
        return {
          triggered: false,
          cancelled: false,
          moved: false,
          released: false,
          hovered: false,
          wheelX: 0,
          wheelY: 0,
        };
      };
    }

    var _TouchInput_clear = TouchInput.clear;
    TouchInput.clear = function () {
      _TouchInput_clear.call(this);
      this._clicked = false;
      this._hovered = false;
      this._newState = this._createNewState();
      this._currentState = this._createNewState();
    };

    var _TouchInput_update = TouchInput.update;
    TouchInput.update = function () {
      _TouchInput_update.call(this);
      if (this._createNewState) {
        this._currentState = this._newState || this._createNewState();
        var state = (this._newState = this._createNewState());
        state.triggered = !!this._triggered;
        state.cancelled = !!this._cancelled;
        state.moved = !!this._moved;
        state.released = !!this._released;
        state.wheelX = this._wheelX || 0;
        state.wheelY = this._wheelY || 0;
        state.hovered = !!this._hovered;
        state.x = this._x;
        state.y = this._y;
        this._clicked = state.released && !state.moved;
        this._hovered = false;
      }
    };

    var _TouchInput_onMouseMove = TouchInput._onMouseMove;
    TouchInput._onMouseMove = function (event) {
      _TouchInput_onMouseMove.call(this, event);
      if (!this.isPressed()) {
        this._hovered = true;
      }
    };

    if (!TouchInput.isClicked) {
      TouchInput.isClicked = function () {
        return !!this._clicked;
      };
    }

    if (!TouchInput.isHovered) {
      TouchInput.isHovered = function () {
        return !!(this._currentState && this._currentState.hovered);
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Window client area + inner children (MZ style, MV-safe)
  if (typeof Window !== "undefined") {
    if (!Window.prototype._createClientArea) {
      Window.prototype._createClientArea = function () {
        if (this._clientArea) return;
        this._clientArea = new Sprite();
        var alphaFilter =
          PIXI.filters && PIXI.filters.AlphaFilter
            ? new PIXI.filters.AlphaFilter()
            : null;
        this._clientArea.filters = alphaFilter ? [alphaFilter] : null;
        this._clientArea.filterArea = alphaFilter ? new Rectangle() : null;

        var pad = this.padding != null ? this.padding : this._padding || 0;
        this._clientArea.move(pad, pad);
        this._innerChildren = this._innerChildren || [];
        this.addChild(this._clientArea);
      };
    }

    if (!Window.prototype._updateClientArea) {
      Window.prototype._updateClientArea = function () {
        if (this._clientArea) {
          var pad = this.padding != null ? this.padding : this._padding || 0;
          this._clientArea.move(pad, pad);
        }
      };
    }

    if (!Window.prototype._updateFilterArea) {
      Window.prototype._updateFilterArea = function () {
        if (this._clientArea && this._clientArea.filterArea) {
          var pad = this.padding != null ? this.padding : this._padding || 0;
          var w = this.width - pad * 2;
          var h = this.height - pad * 2;
          this._clientArea.filterArea.x = this.x + pad;
          this._clientArea.filterArea.y = this.y + pad;
          this._clientArea.filterArea.width = Math.max(0, w);
          this._clientArea.filterArea.height = Math.max(0, h);
        }
      };
    }

    if (!Window.prototype.addInnerChild) {
      Window.prototype.addInnerChild = function (child) {
        this._createClientArea();
        this._innerChildren = this._innerChildren || [];
        if (this._innerChildren.indexOf(child) === -1) {
          this._innerChildren.push(child);
        }
        return this._clientArea.addChild(child);
      };
    }

  }
})();
