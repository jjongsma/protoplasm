ValidatedForm = Class.create();
ValidatedForm.prototype = {
	/* Must past form ID, not form object, or there could be conflicts
	 * with form fields named "id" (at least in Mozilla, form.id returns
	 * the field, not the CSS ID) */
	initialize: function(objType, formId, errorDiv, submitHandler) {
		this.type = objType;
		this.formElement = $(formId);
		this.formId = this.formElement.getAttribute('id');

		// Track unsubmitted changes
		this.changed = false;

		this.validators = Array();
		this.fieldValidators = {};

		this.errors = Array();
		this.errorHeader = $(errorDiv);
		this.fieldErrors = {};
		this.fieldErrorDivs = Array();

		this.submitHandler = submitHandler;

		this.applyFormBehavior();
	},
	applyFormBehavior: function() {
		Event.observe(this.formElement, 'submit', function(e) {
					Event.stop(e);
					this.submit();
					return false;
				}.bindAsEventListener(this));
		var focused = false;
		var elts = this.formElement.elements;
		for (var i = 0; i < elts.length; ++i) {
			if (elts[i].name)
				Event.observe(elts[i], 'keypress', function(e) {
						if (e.keyCode == Event.KEY_RETURN) {
							this.submit();
							return false;
						}
					}.bindAsEventListener(this));
			Event.observe(elts[i], 'blur', function(e) {
					this.validate();
				}.bindAsEventListener(this));
			Event.observe(elts[i], 'change', function(e) {
					this.changed = true;
				}.bindAsEventListener(this));
			if (!focused && !elts[i].disabled && elts[i].type != 'hidden' && elts[i].type != 'submit') {
				elts[i].focus();
				focused = true;
			}
		}
	},
	submit: function(customHandler) {
		customHandler = customHandler || this.submitHandler;
		if (this.validate()) {
			this.clearErrors();
			var obj = this.formElement.serialize(true);
			customHandler(this.type, obj);
			this.changed = false;
		} else {
			this.showErrors();
		}
	},
	validate: function() {	
		this.errors = Array();
		this.clearFieldErrors();

		var valid = true;
		var page = this;

		if (this.fieldValidators)
			$H(this.fieldValidators).each(function(entry) {
					if (!entry.value.validator($F(page.formElement.elements[entry.key]))) {
						valid = false;
						page.addFieldError(entry.key, entry.value.message);
					}
				});
		for (var i = 0; i < this.validators.length; ++i) {
			if (!this.validators[i].validator(this.formElement.serialize(true))) {
				valid = false;
				this.errors[this.errors.length] = this.validators[i].message;
			}
		}
		return valid;
	},
	addFieldError: function(field, error) {
		var errorNode = document.createElement('div');
		errorNode.className = 'fieldError';
		errorNode.innerHTML = error;

		var appendTo = this.formElement.elements[field];
		while(appendTo.nextSibling && Element.hasClassName(appendTo.nextSibling, 'inputExtension'))
			appendTo = appendTo.nextSibling;
		Element.insertAfter(errorNode, appendTo);

		this.fieldErrors[field.name] = error;
		this.fieldErrorDivs[this.fieldErrorDivs.length] = errorNode;
	},
	clearFieldErrors: function() {
		for (var i = 0; i < this.fieldErrorDivs.length; ++i)
			this.fieldErrorDivs[i].parentNode.removeChild(this.fieldErrorDivs[i]);
		this.fieldErrors = {};
		this.fieldErrorDivs = Array();
	},
	clearErrors: function(formId) {
		this.errorHeader.innerHTML = '';
	},
	showErrors: function() {
		var errorHTML = '<div class="error">Please correct the errors noted below:';
		if (this.errors.length > 0) errorHTML += '<br/><ul>';
		for (var i = 0; i < this.errors.length; ++i)
			errorHTML += '<li>' + this.errors[i] + '</li>';
		if (this.errors.length > 0) errorHTML += '</ul>';
		errorHTML += '</div><br />';
		this.errorHeader.innerHTML = errorHTML;
	},
	addValidator: function(validator, message) {
		this.validators[this.validators.length] = { 'validator': validator, 'message': message };
	},
	addFieldValidator: function(field, validator, message) {
		this.fieldValidators[field] = { 'validator': validator, 'message': message };
	}
};

AjaxValidatedForm = Class.create();
AjaxValidatedForm.forms = {};
AjaxValidatedForm.get = function(el) {
		var el = $(el);
		if (AjaxValidatedForm.forms[el.getAttribute('id')])
			return AjaxValidatedForm.forms[el.getAttribute('id')];
	};
AjaxValidatedForm.refresh = function(form) {
		var f = AjaxValidatedForm.get(form);
		if (f) f.applyFormBehavior();
	};
AjaxValidatedForm.refreshParent = function(form) {
		while (form = form.parentNode)
			if (form.nodeType == 1 && form.tagName == 'FORM') {
				AjaxValidatedForm.refresh(form);
				break;
			}
	};
AjaxValidatedForm.prototype = {
	/* Must past form ID, not form object, or there could be conflicts
	 * with form fields named "id" (at least in Mozilla, form.id returns
	 * the field, not the CSS ID) */
	initialize: function(url, formId, errorDiv) {
		this.url = url;
		this.formElement = $(formId);
		this.formId = this.formElement.getAttribute('id');

		this.tooltip = new Element('div', {'className': 'tooltip'});
		this.tooltipPointer = new Element('div', {'className': 'tooltipPointer'});
		this.tooltipMessage = new Element('div', {'className': 'tooltipMessage'});
		this.tooltip.appendChild(this.tooltipPointer);
		this.tooltip.appendChild(this.tooltipMessage);
		this.tooltipField;

		this.changed = [];
		this.touched = [];
		this.lastFocus;

		this.errorHeader = $(errorDiv);
		this.errors = Array();
		this.fieldErrors = {};
		this.relatedErrors = {};
		this.relatedFieldErrors = {};

		this.fieldBlurHandler = this.fieldBlur.bindAsEventListener(this);
		this.fieldFocusHandler = this.fieldFocus.bindAsEventListener(this);
		this.fieldChangeHandler = this.fieldChange.bindAsEventListener(this);

		this.applyFormBehavior();

		AjaxValidatedForm.forms[this.formId] = this;
	},

	applyFormBehavior: function() {
		for (var i = 0; i < this.formElement.elements.length; ++i) {
			var elt = this.formElement.elements[i];

			// First remove handlers if this is a refresh
			Event.stopObserving(elt, 'blur', this.fieldBlurHandler);
			Event.stopObserving(elt, 'focus', this.fieldFocusHandler);
			Event.stopObserving(elt, 'change', this.fieldChangeHandler);

			// Add handlers 
			if (!Element.hasClassName(elt, 'novalidate'))
				Event.observe(elt, 'blur', this.fieldBlurHandler);
			Event.observe(elt, 'focus', this.fieldFocusHandler);
			Event.observe(elt, 'change', this.fieldChangeHandler);

			if (Element.hasClassName(elt, 'inputError'))
				this.touched[this.touched.length] = elt;
		}
		this.validate();
	},

	fieldBlur: function(e) {
		var field = Event.element(e);
		this.fieldBlurByElement(field);
	},

	fieldBlurByElement: function(field) {
		if (this.tooltipField == field)
			if (this.tooltip.parentNode) {
				this.tooltip.remove();
				this.tooltipField = null;
			}

		var updateTxt = new Element('span', {'className': 'fieldUpdate'}).update('Validating...');
		var updateCont = $('fielderror_'+field.name) || $(field.parentNode);
		if (updateCont && updateCont.select('.fieldError', '.fieldUpdate').length > 0) {
			updateCont.select('.fieldError', '.fieldUpdate').invoke('remove');
			updateCont.appendChild(updateTxt);
		}

		this.validate(field);
		this.lastFocus = null;
		this.touched[this.touched.length] = field;
	},

	fieldFocus: function(e) {
		var field = Event.element(e);
		this.lastFocus = field;
		this.attachTooltip(field);
	},

	fieldChange: function(e) {
		var field = Event.element(e);
		this.changed[this.changed.length] = field;
	},

	attachTooltip: function(field) {
		if (field.title) {
			this.tooltipPointer.style.left = '';
			this.tooltipPointer.style.width = '';
			this.tooltipMessage.update(field.title);
			var pos = Position.cumulativeOffset(field);
			pos[0] -= 5;
			this.tooltip.style.left = pos[0]+'px';
			this.tooltip.style.top = (pos[1]+field.offsetHeight)+'px';
			document.body.appendChild(this.tooltip)
			this.tooltip.style.width = (this.tooltipMessage.offsetWidth+10) + 'px';
			if ((pos[0]+this.tooltip.offsetWidth) > document.body.offsetWidth) {
				var adjust = this.tooltip.offsetWidth - (document.body.offsetWidth - pos[0]);
				this.tooltip.style.left = (pos[0]-adjust)+'px';
				this.tooltipPointer.style.left = (10+adjust)+'px';
			}
			this.tooltipField = field;
		}
	},
	validate: function(field) {	
		var query = this.formElement.serialize();
		var callback = this.validationResponse.bind(this);
		new Ajax.Request(this.url, {
				parameters: query,
				onComplete: function (transport) {
					try {
						callback(eval('(' + transport.responseText + ')'), field);
					} catch (e) {
						callback(false, field);
					}
				}
			});
	},
	validationResponse: function(response, field) {	
		// Clear working message
		if (field) {
			var updateCont = $('fielderror_'+field.name) || field.parentNode;
			updateCont.select('.fieldUpdate').invoke('remove');
		}

		if (response == true) {
			this.clearErrors();
			this.clearFieldErrors();
		} else if (response == false) {
			return;
		} else {
			this.errors = response.errors;
			this.fieldErrors = response.fieldErrors;
			this.relatedErrors = response.relatedErrors;
			this.relatedFieldErrors = response.relatedFieldErrors;
			this.showErrors();
		}
	},
	clearFieldErrors: function() {
		$$('.fieldError').invoke('remove');
		this.fieldErrors = {};
	},
	clearErrors: function() {
		this.errors = Array();
		this.errorHeader.innerHTML = '';
	},
	showErrors: function(showHeader) {
		if (showHeader) {
			while (this.errorHeader.firstChild)
				this.errorHeader.removeChild(this.errorHeader.firstChild);
			var em = new Element('div', {'className': 'error'});
			em.appendChild(new Element('b').update('Validation Failed'));
			em.appendChild(new Element('br'));
			em.appendChild(document.createTextNode('Please correct the errors shown below.'));
			if (this.errors) {
				em.appendChild(new Element('br'));
				var el = new Element('ul');
				for (var i = 0; i < this.errors.length; ++i)
					el.appendChild(new Element('li').update(this.errors[i]));
				em.appendChild(el);
			}
			this.errorHeader.appendChild(em);
			this.errorHeader.appendChild(new Element('br'));
			//if (this.lastFocus)
				//this.lastFocus.select();
		}
		
		$$('.fieldError').invoke('remove');
		$$('.inputError').each(function (el) { el.removeClassName('inputError'); el.title = ''; });
		if (this.tooltip.parentNode) {
			this.tooltip.remove();
			this.tooltipField = null;
		}
		var f = this.formElement;
		if (this.fieldErrors) {
			$H(this.fieldErrors).each(function(item) {
					var field = f.elements[item[0]];
					if (!field)
						field = f.elements[item[0]+'[]'];
					if (!field) {
						var altname = item[0].replace(/\./, '__');
						field = f.elements[altname];
						if (!field)
							field = f.elements[altname+'[]'];
					}
					var errorCont = $('fielderror_'+item[0]);
					if (field) {
						if (this.touched.include(field))
							Element.addClassName(field, 'inputError');
						if (!errorCont) errorCont = field.parentNode;
					}
					if (errorCont) {
						var errorNode = new Element('span', {'className': 'fieldError'}).update(item[1][0]);
						errorCont.appendChild(errorNode);
					}
				}.bind(this));
		}
		if (this.relatedFieldErrors) {
			$H(this.relatedFieldErrors).each(function(item) {
				var relation = item[0];
				$H(item[1]).each(function(index) {
					var idx = index[0].substring(1);
					$H(index[1]).each(function(fielderr) {
						var fieldname = '_'+relation+'_'+fielderr[0];
						var field = f.elements[fieldname+'[]'];
						if (field instanceof NodeList)
							field = field[idx];
						Element.addClassName(field, 'inputError');
						field.title = fielderr[1][0];
						if (this.lastFocus == field)
							this.attachTooltip(field);
						/*
						var errorNode = new Element('span', {'className': 'fieldError'}).update(fielderr[1][0]);
						var errorCont = $$('.fielderror_'+fieldname)[idx] || field.parentNode;
						if (errorCont) {
							errorCont.appendChild(errorNode);
						}
						*/
					}.bind(this));
				}.bind(this));
			}.bind(this));
		}
	}
};

Validators = {
	requiredStringValidator: function(allowEmpty) {
		return function(value) {
			if (value != null && (allowEmpty || value != ''))
				return true;
			return false;
		};
	},
	regexValidator: function(expression) {
		return function(value) {
			return expression.test(value);
		};
	}
};
