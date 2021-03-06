document.observe("dom:loaded", function() {
  RecordSelect.document_loaded = true;
  document.on('click', 'div.record-select li.record', function(event) {
    var link = event.findElement();
    if (link) {
      RecordSelect.select_item(link);
      event.stop();
    }
    return true;
  });  
});    

Form.Element.AfterActivity = function(element, callback, delay) {
  element = $(element);
  if (!delay) delay = 0.25;
  new Form.Element.Observer(element, delay, function(element, value) {
    // TODO: display loading indicator
    if (element.activity_timer) clearTimeout(element.activity_timer);
    element.activity_timer = setTimeout(function() {
      callback(element.value);
    }, delay * 1000 + 50);
  });
}

var RecordSelect = new Object();
RecordSelect.document_loaded = false;

RecordSelect.select_item = function(item) {
  var e = Element.up(item, '.record-select-handler');
  var onselect = e.onselect || e.getAttribute('onselect');
  if (typeof onselect != 'function') onselect = eval(onselect);
  if (onselect) {
    try {
      onselect(item.id.substr(2), (item.down('label') || item).innerHTML.unescapeHTML(), e);
    } catch(e) {
      alert(e);
    }
  }
};

RecordSelect.observe = function(id) {
  var form = $(id);
  Form.Element.AfterActivity(form.down('input.text-input'), function() { form.down('input.search_submit').click(); }, 0.35);
}

RecordSelect.render_page = function(record_select_id, page) {
  var page_element = $$('#' + record_select_id + ' ol')[0];
  if (page_element) Element.replace(page_element, page);
};

RecordSelect.Abstract = Class.create();
Object.extend(RecordSelect.Abstract.prototype, {
  /**
   * obj - the id or element that will anchor the recordselect to the page
   * url - the url to run the recordselect
   * options - ??? (check concrete classes)
   */
  initialize: function(obj, url, options) {
    this.obj = $(obj);
    this.url = url;
    this.options = options;
    this.container;
    if (this.options.onchange && typeof this.options.onchange != 'function') {
      this.options.onchange = eval(this.options.onchange);
    }

    if (RecordSelect.document_loaded) this.onload();
    else Event.observe(window, 'load', this.onload.bind(this));
  },

  /**
   * Finish the setup - IE doesn't like doing certain things before the page loads
   * --override--
   */
  onload: function() {},

  /**
   * the onselect event handler - when someone clicks on a record
   * --override--
   */
  onselect: function(id, value) {
    alert(id + ': ' + value);
  },

  /**
   * opens the recordselect
   */
  open: function() {
    if (this.is_open()) return;

    this.container.update('');
    this.container.show();
    new Ajax.Updater(this.container, this.url, {
      method: 'get',
      parameters: {search: $F(this.obj)},
      evalScripts: true,
      asynchronous: true,
      onComplete: function() {
        // needs to be mousedown so the event doesn't get canceled by other code (see issue #26)
        if (!this.container.visible()) this.close();
        else {
          RecordSelect.observe(this.container.down('form').readAttribute('id'));
          this.show();
          Element.observe(document.body, 'mousedown', this.onbodyclick.bindAsEventListener(this));
        }
      }.bind(this)
    });
  },

  /**
   * positions and reveals the recordselect
   */
  show: function() {
    var offset = Position.cumulativeOffset(this.obj),
        top = Element.getHeight(this.obj) + offset[1],
        window_height = document.viewport.getHeight();
    this.container.style.left = offset[0] + 'px';
    if (top + Element.getHeight(this.container) > window_height) {
      this.container.style.bottom = (window_height - offset[1]) + 'px';
      this.container.style.top = '';
    } else {
      this.container.style.top = top + 'px';
      this.container.style.bottom = '';
    }

    if (this._use_iframe_mask()) {
      this.container.insertAdjacentHTML('afterEnd', '<iframe src="javascript:false;" class="record-select-mask" />');
      var mask = this.container.next('iframe');
      mask.style.left = this.container.style.left;
      mask.style.top = this.container.style.top;
    }

    this.container.show();

    if (this._use_iframe_mask()) {
      var dimensions = this.container.immediateDescendants().first().getDimensions();
      mask.style.width = dimensions.width + 'px';
      mask.style.height = dimensions.height + 'px';
    }
  },

  /**
   * closes the recordselect by emptying the container
   */
  close: function() {
    if (this._use_iframe_mask()) {
      this.container.next('iframe').remove();
    }

    this.container.hide();
    // hopefully by using remove() instead of innerHTML we won't leak memory
    this.container.immediateDescendants().invoke('remove');
  },

  /**
   * returns true/false for whether the recordselect is open
   */
  is_open: function() {
	  return (!this.container.innerHTML.blank())
  },

  /**
   * when the user clicks outside the dropdown
   */
  onbodyclick: function(ev) {
    if (!this.is_open()) return;
    var elem = $(Event.element(ev));
    var ancestors = elem.ancestors();
    ancestors.push(elem);
    if (ancestors.include(this.container) || ancestors.include(this.obj)) return;
    this.close();
  },

  /**
   * creates and initializes (and returns) the recordselect container
   */
  create_container: function() {
    new Insertion.Bottom(document.body, '<div class="record-select-container record-select-handler"></div>');
    e = document.body.childNodes[document.body.childNodes.length - 1];
    e.onselect = this.onselect.bind(this);
    e.style.display = 'none';

    return $(e);
  },

  /**
   * all the behavior to respond to a text field as a search box
   */
  _respond_to_text_field: function(text_field) {
    // attach the events to start this party
    text_field.observe('focus', this.open.bind(this));

    // the autosearch event - needs to happen slightly late (keyup is later than keypress)
    text_field.observe('keyup', function() {
      if (!this.is_open()) return;
      this.container.down('.text-input').value = text_field.value;
    }.bind(this));

    // keyboard navigation, if available
    if (this.onkeydown) {
      text_field.observe('keydown', this.onkeydown.bind(this));
    }
  },

  _use_iframe_mask: function() {
    return this.container.insertAdjacentHTML ? true : false;
  }
});

/**
 * Adds keyboard navigation to RecordSelect objects
 */
Object.extend(RecordSelect.Abstract.prototype, {
  current: null,

  /**
   * keyboard navigation - where to intercept the keys is up to the concrete class
   */
  onkeydown: function(ev) {
    var elem;
    switch (ev.keyCode) {
      case Event.KEY_UP:
        if (this.current && this.current.up('.record-select')) elem = this.current.previous();
        if (!elem) elem = this.container.getElementsBySelector('ol li.record').last();
        this.highlight(elem);
        break;
      case Event.KEY_DOWN:
        if (this.current && this.current.up('.record-select')) elem = this.current.next();
        if (!elem) elem = this.container.getElementsBySelector('ol li.record').first();
        this.highlight(elem);
        break;
      case Event.KEY_RETURN:
        if (this.current) this.current.onclick();
        break;
      case Event.KEY_RIGHT:
        elem = this.container.down('li.pagination.next');
        if (elem) elem.down('a').onclick();
        break;
      case Event.KEY_LEFT:
        elem = this.container.down('li.pagination.previous');
        if (elem) elem.down('a').onclick();
        break;
      case Event.KEY_ESC:
      case Event.KEY_TAB:
        this.close();
        break;
      default:
        return;
    }
    if (ev.keyCode != Event.KEY_TAB) { // don't prevent tabbing
      Event.stop(ev); // so "enter" doesn't submit the form, among other things(?)
    }
  },

  /**
   * moves the highlight to a new object
   */
  highlight: function(obj) {
    if (this.current) this.current.removeClassName('current');
    this.current = $(obj);
    obj.addClassName('current');
  }
});

/**
 * Used by link_to_record_select
 * The options hash should contain a onselect: key, with a javascript function as value
 */
RecordSelect.Dialog = Class.create();
RecordSelect.Dialog.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    this.container = this.create_container();
    this.obj.observe('click', this.toggle.bind(this));

    if (this.onkeypress) this.obj.observe('keypress', this.onkeypress.bind(this));
  },

  onselect: function(id, value) {
    if (this.options.onselect(id, value) != false) this.close();
  },

  toggle: function() {
    if (this.is_open()) this.close();
    else this.open();
  }
});

/**
 * Used by record_select_field helper
 * The options hash may contain id: and label: keys, designating the current value
 * The options hash may also include an onchange: key, where the value is a javascript function (or eval-able string) for an callback routine
 * and field_name: key, where value will be set as name of the input field.
 */
RecordSelect.Single = Class.create();
RecordSelect.Single.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    // initialize the container
    this.container = this.create_container();
    this.container.addClassName('record-select-autocomplete');
    this.container.observe('submit', function() {
      this.hidden_input.value = '';
      this.obj.removeClassName('selected');
    }.bind(this));

    // create the hidden input
    new Insertion.After(this.obj, '<input type="hidden" name="" value="" />')
    this.hidden_input = this.obj.next();

    // transfer the input name from the text input to the hidden input
    this.hidden_input.name = this.obj.name;
    this.obj.name = this.options.field_name || '';

    // initialize the values
    if (this.options.label) this.set(this.options.id, this.options.label);

    this._respond_to_text_field(this.obj);
    if (this.obj.focused) this.open(); // if it was focused before we could attach observers
  },

  onselect: function(id, value) {
    this.set(id, value);
    if (this.options.onchange) this.options.onchange.call(this, id, value);
    this.obj.fire('recordselect:change', {"id": id, "label": value});
    this.close();
  },

  /**
   * sets the id/label
   */
  set: function(id, label) {
    this.obj.value = label.unescapeHTML();
    this.hidden_input.value = id;
    this.obj.addClassName('selected');
  }
});

/**
 * Used by record_select_autocomplete helper
 * The options hash may contain label: key, designating the current value
 * The options hash may also include an onchange: key, where the value is a javascript function (or eval-able string) for an callback routine.
 */
RecordSelect.Autocomplete = Class.create();
RecordSelect.Autocomplete.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    // initialize the container
    this.container = this.create_container();
    this.container.addClassName('record-select-autocomplete');

    // initialize the values
    if (this.options.label) this.set(this.options.label);

    this._respond_to_text_field(this.obj);
    if (this.obj.focused) this.open(); // if it was focused before we could attach observers
  },

  close: function() {
    // if they close the dialog with the text field empty, then delete the id value
    if (this.obj.value == '') this.set('', '');

    RecordSelect.Abstract.prototype.close.call(this);
  },

  onselect: function(id, value) {
    this.set(value);
    if (this.options.onchange) this.options.onchange.call(this, id, value);
    this.obj.fire('recordselect:change', {"id": id, "label": value});
    this.close();
  },

  /**
   * sets the id/label
   */
  set: function(label) {
    this.obj.value = label.unescapeHTML();
  }
});

/**
 * Used by record_multi_select_field helper.
 * Options:
 *   list - the id (or object) of the <ul> to contain the <li>s of selected entries
 *   current - an array of id:/label: keys designating the currently selected entries
 */
RecordSelect.Multiple = Class.create();
RecordSelect.Multiple.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    // initialize the container
    this.container = this.create_container();
    this.container.addClassName('record-select-autocomplete');

    // decide where the <li> entries should be placed
    if (this.options.list) this.list_container = $(this.options.list);
    else this.list_container = this.obj.next('ul');

    // take the input name from the text input, and store it for this.add()
    this.input_name = this.obj.name;
    this.obj.name = '';

    // initialize the list
    $A(this.options.current).each(function(c) {
      this.add(c.id, c.label);
    }.bind(this));

    this._respond_to_text_field(this.obj);
    if (this.obj.focused) this.open(); // if it was focused before we could attach observers
  },

  onselect: function(id, value) {
    this.add(id, value);
  },

  /**
   * Adds a record to the selected list
   */
  add: function(id, label) {
    // return silently if this value has already been selected
    var already_selected = this.list_container.getElementsBySelector('input').any(function(i) {
      return i.value == id
    });
    if (already_selected) return;

    var entry = '<li>'
              + '<a href="#" onclick="$(this.parentNode).remove(); return false;" class="remove">remove</a>'
              + '<input type="hidden" name="' + this.input_name + '" value="' + id + '" />'
              + '<label>' + label + '</label>'
              + '</li>';
    new Insertion.Top(this.list_container, entry);
  }
});
