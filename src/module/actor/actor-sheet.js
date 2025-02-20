import { OseEntityTweaks } from "../dialog/entity-tweaks";
import { OSE } from "../config";

export class OseActorSheet extends ActorSheet {
  constructor(...args) {
    super(...args);
  }
  /* -------------------------------------------- */

  getData() {
    const data = foundry.utils.deepClone(super.getData().data);
    data.owner = this.actor.isOwner;
    data.editable = this.actor.sheet.isEditable;

    data.config = {
      ...CONFIG.OSE,
      ascendingAC: game.settings.get(game.system.id, "ascendingAC"),
      initiative: game.settings.get(game.system.id, "initiative") != "group",
      encumbrance: game.settings.get(game.system.id, "encumbranceOption"),
    };
    data.isNew = this.actor.isNew();

    return data;
  }

  activateEditor(name, options, initialContent) {
    // remove some controls to the editor as the space is lacking
    // if (name == "data.details.description") {
    //   options.toolbar = "styleselect bullist hr table removeFormat save";
    // }
    super.activateEditor(name, options, initialContent);
  }

  // Helpers

  _getItemFromActor(event) {
    const li = event.currentTarget.closest(".item-entry");
    const item = this.actor.items.get(li.dataset.itemId);

    return item;
  }

  // end Helpers

  _toggleItemCategory(event) {
    event.preventDefault();
    const targetCategory = $(event.currentTarget);
    let items = targetCategory.next(".item-list");

    if (items.css("display") === "none") {
      let el = $(event.currentTarget).find(".fas.fa-caret-right");
      el.removeClass("fa-caret-right");
      el.addClass("fa-caret-down");

      items.slideDown(200);
    } else {
      let el = $(event.currentTarget).find(".fas.fa-caret-down");
      el.removeClass("fa-caret-down");
      el.addClass("fa-caret-right");

      items.slideUp(200);
    }
  }

  _toggleContainedItems(event) {
    event.preventDefault();
    const targetItems = $(event.target.closest(".container"));
    let items = targetItems.find(".item-list.contained-items");

    if (items.css("display") === "none") {
      let el = targetItems.find(".fas.fa-caret-right");
      el.removeClass("fa-caret-right");
      el.addClass("fa-caret-down");

      items.slideDown(200);
    } else {
      let el = targetItems.find(".fas.fa-caret-down");
      el.removeClass("fa-caret-down");
      el.addClass("fa-caret-right");

      items.slideUp(200);
    }
  }

  _toggleItemSummary(event) {
    event.preventDefault();
    const itemSummary = event.currentTarget
      .closest(".item-entry.item")
      .querySelector(".item-summary");
    if (itemSummary.style.display === "") {
      itemSummary.style.display = "block";
    } else {
      itemSummary.style.display = "";
    }
  }

  async _displayItemInChat(event) {
    const li = $(event.currentTarget).closest(".item-entry");
    const item = this.actor.items.get(li.data("itemId"));
    item.show();
  }

  async _removeItemFromActor(event) {
    const item = this._getItemFromActor(event);
    const itemData = item?.system;
    const itemDisplay = event.currentTarget.closest(".item-entry");

    if (item.type === "container" && itemData.itemIds) {
      const containedItems = itemData.itemIds;
      const updateData = containedItems.reduce((acc, val) => {
        acc.push({ _id: val.id, "system.containerId": "" });
        return acc;
      }, []);

      await this.actor.updateEmbeddedDocuments("Item", updateData);
    }
    this.actor.deleteEmbeddedDocuments("Item", [itemDisplay.dataset.itemId]);
  }

  /**
   * @param {bool} decrement
   */
  _useConsumable(event, decrement) {
    const item = this._getItemFromActor(event);
    if (!item) return null;
    let {
      quantity: { value: quantity },
    } = item.system;
    item.update({
      "system.quantity.value": decrement ? --quantity : ++quantity,
    });
  }

  async _onSpellChange(event) {
    event.preventDefault();
    const item = this._getItemFromActor(event);
    if (event.target.dataset.field == "cast") {
      return item.update({ "system.cast": parseInt(event.target.value) });
    } else if (event.target.dataset.field == "memorize") {
      return item.update({
        "system.memorized": parseInt(event.target.value),
      });
    }
  }

  async _resetSpells(event) {
    let spells = $(event.currentTarget)
      .closest(".inventory.spells")
      .find(".item-entry");
    spells.each((_, el) => {
      let itemId = el.dataset.itemId;
      const item = this.actor.items.get(itemId);
      const itemData = item?.system;
      item.update({
        _id: item.id,
        "system.cast": itemData.memorized,
      });
    });
  }

  async _rollAbility(event) {
    const item = this._getItemFromActor(event);
    const itemData = item?.system;
    if (item.type == "weapon") {
      if (this.actor.type === "monster") {
        item.update({
          'system.counter.value': itemData.counter.value - 1
        });
      }
      item.rollWeapon({ skipDialog: event.ctrlKey || event.metaKey });
    } else if (item.type == "spell") {
      item.spendSpell({ skipDialog: event.ctrlKey || event.metaKey });
    } else {
      item.rollFormula({ skipDialog: event.ctrlKey || event.metaKey });
    }
  }

  async _rollSave(event) {
    let actorObject = this.actor;
    let element = event.currentTarget;
    let save = element.parentElement.parentElement.dataset.save;
    actorObject.rollSave(save, { event: event });
  }

  async _rollAttack(event) {
    let actorObject = this.actor;
    let element = event.currentTarget;
    let attack = element.parentElement.parentElement.dataset.attack;
    actorObject.targetAttack({ roll: {} }, attack, {
      type: attack,
      skipDialog: event.ctrlKey || event.metaKey,
    });
  }

  _onSortItem(event, itemData) {
    const source = this.actor.items.get(itemData._id);
    const siblings = this.actor.items.filter((i) => {
      return i.data._id !== source.data._id;
    });
    const dropTarget = event.target.closest("[data-item-id]");
    const targetId = dropTarget ? dropTarget.dataset.itemId : null;
    const target = siblings.find((s) => s.data._id === targetId);
    if (!target) throw new Error("Couldn't drop near "+ event.target);
    const targetData = target?.system;

    // Dragging items into a container
    if (
      (target?.type === "container" || target?.data?.type === "container") &&
      targetData.containerId === ""
    ) {
      this.actor.updateEmbeddedDocuments("Item", [
        { _id: source.id, "system.containerId": target.id },
      ]);
      return;
    }
    if (source?.system.containerId !== "") {
      this.actor.updateEmbeddedDocuments("Item", [
        { _id: source.id, "system.containerId": "" },
      ]);
    }

    super._onSortItem(event, itemData);
  }

  _onDragStart(event) {
    const li = event.currentTarget;
    let itemIdsArray = [];
    if (event.target.classList.contains("content-link")) return;

    // Create drag data
    const dragData = {
      actorId: this.actor.id,
      sceneId: this.actor.isToken ? canvas.scene?.id : null,
      tokenId: this.actor.isToken ? this.actor.token.id : null,
      pack: this.actor.pack,
    };

    // Owned Items
    if (li.dataset.itemId) {
      const item = this.actor.items.get(li.dataset.itemId);
      dragData.type = "Item";
      dragData.data = item;
      if (item.type === "container" && item.system.itemIds.length) {
        //otherwise JSON.stringify will quadruple stringify for some reason
        itemIdsArray = item.system.itemIds;
      }
    }

    // Active Effect
    if (li.dataset.effectId) {
      const effect = this.actor.effects.get(li.dataset.effectId);
      dragData.type = "ActiveEffect";
      dragData.data = effect.data;
    }

    // Set data transfer
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify(dragData, (key, value) => {
        if (key === "itemIds") {
          //something about how this Array is created makes its elements not real Array elements
          //we go through this hoop to trick stringify into creating our string
          return JSON.stringify(itemIdsArray);
        }
        return value;
      })
    );
  }
  async _onDropItem(event, data){
    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    const exists = !!this.actor.items.get(item.id);
    
    if (!exists)
      return this._onDropItemCreate([itemData]);
    
    const isContainer = this.actor.items.get(item.system.containerId);
    
    if (isContainer)
      return this._onContainerItemRemove(item, isContainer);
    
    const {itemId: targetId} = event.target.closest('.item').dataset;
    const targetItem = this.actor.items.get(targetId)
    const targetIsContainer = targetItem?.type === 'container'

    if (targetIsContainer)
      return this._onContainerItemAdd(item, targetItem);

  }
  async _onContainerItemRemove(item, container) {
    const newList = container.system.itemIds.filter((s) => s != item.id);
    const itemObj = this.object.items.get(item.id);
    await container.update({ system: { itemIds: newList } });
    await itemObj.update({ system: { containerId: "" } });
  }
  async _onContainerItemAdd(item, target) {
    const itemData = item.toObject();
    const container = this.object.items.get(target.id);

    const containerId = container.id;
    const itemObj = this.object.items.get(item.id);
    const alreadyExists = container.system.itemIds.find((i) => i.id == item.id);
    if (!alreadyExists) {
      const newList = [...container.system.itemIds, item.id];
      await container.update({ system: { itemIds: newList } });
      await itemObj.update({ system: { containerId: container.id } });
    }
  }
  async _onDropItemCreate(itemData, container = false) {
    //override to fix hidden items because their original containers don't exist on this actor
    itemData = itemData instanceof Array ? itemData : [itemData];
    itemData.forEach((item) => {
      if (item.system.containerId && item.system.containerId !== "")
        item.system.containerId = "";
      if (
        item.type === "container" &&
        typeof item.system.itemIds === "string"
      ) {
        //itemIds was double stringified to fix strange behavior with stringify blanking our Arrays
        const containedItems = JSON.parse(item.system.itemIds);
        containedItems.forEach((containedItem) => {
          containedItem.system.containerId = "";
        });
        itemData.push(...containedItems);
      }
    });
    if (!container) {
      return this.actor.createEmbeddedDocuments("Item", itemData);
    }

    let itemIds = container.system.itemIds;
    itemIds.push(itemData.id);
    const item = this.actor.items.get(itemData[0]._id);
    await item.update({ system: { containerId: container.id } });
    await container.update({ system: { itemIds: itemIds } });
  }

  /* -------------------------------------------- */

  async _chooseItemType(choices = ["weapon", "armor", "shield", "gear"]) {
    let templateData = { types: choices },
      dlg = await renderTemplate(
        `${OSE.systemPath()}/templates/items/entity-create.html`,
        templateData
      );
    //Create Dialog window
    return new Promise((resolve) => {
      new Dialog({
        title: game.i18n.localize("OSE.dialog.createItem"),
        content: dlg,
        buttons: {
          ok: {
            label: game.i18n.localize("OSE.Ok"),
            icon: '<i class="fas fa-check"></i>',
            callback: (html) => {
              resolve({
                type: html.find('select[name="type"]').val(),
                name: html.find('input[name="name"]').val(),
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("OSE.Cancel"),
          },
        },
        default: "ok",
      }).render(true);
    });
  }

  _createItem(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const { treasure, type } = header.dataset;
    const createItem = (type, name) => ({
      name: name ? name : `New ${type.capitalize()}`,
      type: type,
    });

    // Getting back to main logic
    if (type === "choice") {
      const choices = header.dataset.choices.split(",");
      this._chooseItemType(choices).then((dialogInput) => {
        const itemData = createItem(dialogInput.type, dialogInput.name);
        this.actor.createEmbeddedDocuments("Item", [itemData], {});
      });
    } else {
      const itemData = createItem(type);
      if (treasure) itemData.system = { treasure: true }
      return this.actor.createEmbeddedDocuments("Item", [itemData], {});
    }
  }

  async _updateItemQuantity(event) {
    event.preventDefault();
    const item = this._getItemFromActor(event);

    if (event.target.dataset.field === "value") {
      return item.update({
        "system.quantity.value": parseInt(event.target.value),
      });
    } else if (event.target.dataset.field === "max") {
      return item.update({
        "system.quantity.max": parseInt(event.target.value),
      });
    }
  }

  // Override to set resizable initial size
  async _renderInner(...args) {
    const html = await super._renderInner(...args);
    this.form = html[0];

    // Resize resizable classes
    let resizable = html.find(".resizable");
    if (resizable.length == 0) {
      return;
    }
    resizable.each((_, el) => {
      let heightDelta = this.position.height - this.options.height;
      el.style.height = `${heightDelta + parseInt(el.dataset.baseSize)}px`;
    });
    return html;
  }

  async _onResize(event) {
    super._onResize(event);

    let html = $(this.form);
    let resizable = html.find(".resizable");
    if (resizable.length == 0) {
      return;
    }
    // Resize divs
    resizable.each((_, el) => {
      let heightDelta = this.position.height - this.options.height;
      el.style.height = `${heightDelta + parseInt(el.dataset.baseSize)}px`;
    });
    // Resize editors
    let editors = html.find(".editor");
    editors.each((id, editor) => {
      let container = editor.closest(".resizable-editor");
      if (container) {
        let heightDelta = this.position.height - this.options.height;
        editor.style.height = `${
          heightDelta + parseInt(container.dataset.editorSize)
        }px`;
      }
    });
  }

  _onConfigureActor(event) {
    event.preventDefault();
    new OseEntityTweaks(this.actor, {
      top: this.position.top + 40,
      left: this.position.left + (this.position.width - 400) / 2,
    }).render(true);
  }

  /**
   * Extend and override the sheet header buttons
   * @override
   */
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();

    // Token Configuration
    const canConfigure = game.user.isGM || this.actor.isOwner;
    if (this.options.editable && canConfigure) {
      buttons = [
        {
          label: game.i18n.localize("OSE.dialog.tweaks"),
          class: "configure-actor",
          icon: "fas fa-code",
          onclick: (event) => this._onConfigureActor(event),
        },
      ].concat(buttons);
    }
    return buttons;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Attributes
    html.find(".saving-throw .attribute-name a").click((event) => {
      this._rollSave(event);
    });

    html.find(".attack a").click((event) => {
      this._rollAttack(event);
    });

    html.find(".hit-dice .attribute-name").click((event) => {
      this.actor.rollHitDice({ event: event });
    });

    // Items (Abilities, Inventory and Spells)
    html.find(".item-rollable .item-image").click(async (event) => {
      this._rollAbility(event);
    });

    html.find(".inventory .item-category-title").click((event) => {
      this._toggleItemCategory(event);
    });
    html.find(".inventory .item-category-title input").click((event) => {
      event.stopPropagation();
    });
    html.find(".inventory .category-caret").click((event) => {
      this._toggleContainedItems(event);
    });

    html.find(".item-name").click((event) => {
      this._toggleItemSummary(event);
    });

    html.find(".item-controls .item-show").click(async (event) => {
      this._displayItemInChat(event);
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Item Management
    html.find(".item-create").click((event) => {
      this._createItem(event);
    });

    html.find(".item-edit").click((event) => {
      const item = this._getItemFromActor(event);
      item.sheet.render(true);
    });

    html.find(".item-delete").click((event) => {
      this._removeItemFromActor(event);
    });

    html
      .find(".quantity input")
      .click((ev) => ev.target.select())
      .change(this._updateItemQuantity.bind(this));

    // Consumables
    html.find(".consumable-counter .full-mark").click((event) => {
      this._useConsumable(event, true);
    });
    html.find(".consumable-counter .empty-mark").click((event) => {
      this._useConsumable(event, false);
    });

    // Spells
    html
      .find(".memorize input")
      .click((event) => event.target.select())
      .change(this._onSpellChange.bind(this));

    html
      .find(".spells .item-reset[data-action='reset-spells']")
      .click((event) => {
        this._resetSpells(event);
      });
  }
}
