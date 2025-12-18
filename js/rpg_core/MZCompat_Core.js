//-----------------------------------------------------------------------------
// MZ Core Compatibility
//
// Adds lightweight shims so MZ plugins can coexist with MV code.

if (typeof Main === "undefined") {
  function Main() {}
}

Main.prototype.eraseLoadingSpinner = function () {
  var spinner = document.getElementById("loadingSpinner");
  if (spinner && spinner.parentNode) {
    spinner.parentNode.removeChild(spinner);
  }
  if (Graphics._loadingSpinner && Graphics._loadingSpinner.parentNode) {
    Graphics._loadingSpinner.parentNode.removeChild(Graphics._loadingSpinner);
  }
};

// TouchInput hover helper (noop but prevents plugin crashes)
if (typeof TouchInput.isHovered !== "function") {
  TouchInput.isHovered = function () {
    return false;
  };
}

// Tilemap.Layer alias used by some plugins to tweak rendering
if (typeof Tilemap !== "undefined" && !Tilemap.Layer) {
  Tilemap.Layer = PIXI.Container;
}

// Loading spinner helper for MZ-style plugins
if (typeof Graphics._createLoadingSpinner !== "function") {
  Graphics._createLoadingSpinner = function () {
    var spinner = document.createElement("div");
    spinner.id = "loadingSpinner";
    spinner.style.display = "none";
    spinner.style.width = "60px";
    spinner.style.height = "60px";
    spinner.style.border = "8px solid #f3f3f3";
    spinner.style.borderTop = "8px solid #555";
    spinner.style.borderRadius = "50%";
    spinner.style.position = "absolute";
    spinner.style.left = "50%";
    spinner.style.top = "50%";
    spinner.style.transform = "translate(-50%, -50%)";
    spinner.style.boxSizing = "border-box";
    spinner.style.zIndex = 99;
    spinner.style.animation = "spin 1s linear infinite";
    document.body.appendChild(spinner);
    Graphics._loadingSpinner = spinner;
  };
}

// Window compatibility: frameVisible and _frameSprite alias to MZ naming
if (typeof Window !== "undefined") {
  if (!Object.getOwnPropertyDescriptor(Window.prototype, "frameVisible")) {
    Object.defineProperty(Window.prototype, "frameVisible", {
      get: function () {
        return this._windowFrameSprite ? this._windowFrameSprite.visible : true;
      },
      set: function (value) {
        if (this._windowFrameSprite) {
          this._windowFrameSprite.visible = value;
        }
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(Window.prototype, "_frameSprite")) {
    Object.defineProperty(Window.prototype, "_frameSprite", {
      get: function () {
        return this._windowFrameSprite;
      },
      set: function (value) {
        this._windowFrameSprite = value;
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(Window.prototype, "_contentsSprite")) {
    Object.defineProperty(Window.prototype, "_contentsSprite", {
      get: function () {
        return this._windowContentsSprite;
      },
      set: function (value) {
        this._windowContentsSprite = value;
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(Window.prototype, "_pauseSignSprite")) {
    Object.defineProperty(Window.prototype, "_pauseSignSprite", {
      get: function () {
        return this._windowPauseSignSprite;
      },
      set: function (value) {
        this._windowPauseSignSprite = value;
      },
      configurable: true,
    });
  }
}

// Window client area and pause sprites used by MZ plugins
if (typeof Window !== "undefined" && !Window.prototype._clientArea) {
  Window.prototype._createClientArea = function () {
    this._clientArea = new Sprite();
    this._clientArea.filters = [new PIXI.filters.AlphaFilter()];
    this._clientArea.filterArea = new Rectangle();
    this._clientArea.move(this._padding, this._padding);
    this.addChild(this._clientArea);
  };

  // Rebuild container parts to include client area before contents
  Window.prototype._createAllParts = function () {
    this._windowSpriteContainer = new PIXI.Container();
    this._windowBackSprite = new Sprite();
    this._windowCursorSprite = new Sprite();
    this._windowFrameSprite = new Sprite();
    this._windowContentsSprite = new Sprite();
    this._downArrowSprite = new Sprite();
    this._upArrowSprite = new Sprite();
    this._windowPauseSignSprite = new Sprite();

    this._windowBackSprite.bitmap = new Bitmap(1, 1);
    this._windowBackSprite.alpha = 192 / 255;

    this.addChild(this._windowSpriteContainer);
    this._windowSpriteContainer.addChild(this._windowBackSprite);
    this._windowSpriteContainer.addChild(this._windowFrameSprite);

    this._createClientArea();
    this._clientArea.addChild(this._windowCursorSprite);
    this._clientArea.addChild(this._windowContentsSprite);

    this.addChild(this._downArrowSprite);
    this.addChild(this._upArrowSprite);
    this.addChild(this._windowPauseSignSprite);
  };
}
