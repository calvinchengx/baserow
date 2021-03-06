<template>
  <div ref="wrapper" class="grid-view__column" @click="select($event)">
    <component
      :is="getFieldComponent(field.type)"
      ref="field"
      :field="field"
      :value="row['field_' + field.id]"
      :selected="selected"
      @update="update"
      @edit="edit"
      @select="$refs.wrapper.click()"
    />
  </div>
</template>

<script>
import { isElement } from '@baserow/modules/core/utils/dom'
import { copyToClipboard } from '@baserow/modules/database/utils/clipboard'

export default {
  name: 'GridViewField',
  props: {
    field: {
      type: Object,
      required: true,
    },
    row: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      /**
       * Indicates whether the field is selected.
       */
      selected: false,
      /**
       * Timestamp of the last the time the user clicked on the field. We need this to
       * check if it was double clicked.
       */
      clickTimestamp: null,
    }
  },
  /**
   * Because the component can be destroyed if it moves out of the viewport we might
   * need to take some action if the the component is in a selected state.
   */
  beforeDestroy() {
    if (this.selected) {
      this.unselect()
    }
  },
  methods: {
    getFieldComponent(type) {
      return this.$registry.get('field', type).getGridViewFieldComponent()
    },
    /**
     * If the grid field component emits an update event this method will be called
     * which will actually update the value via the store.
     */
    update(value, oldValue) {
      this.$emit('update', {
        row: this.row,
        field: this.field,
        value,
        oldValue,
      })
    },
    /**
     * If the grid field components emits an edit event then the user has changed the
     * value without saving it yet. This is for example used to check in real time if
     * the value still matches the filters.
     */
    edit(value, oldValue) {
      this.$emit('edit', {
        row: this.row,
        field: this.field,
        value,
        oldValue,
      })
    },
    /**
     * Method that is called when a user clicks on the grid field. It wil
     * @TODO improve speed somehow, maybe with the fastclick library.
     */
    select(event) {
      const timestamp = new Date().getTime()

      if (this.selected) {
        // If the field is already selected we will check if the click is a doubleclick
        // if it was within 200 ms. The double click event can be useful for components
        // because they might want to change the editing state.
        if (
          this.clickTimestamp !== null &&
          timestamp - this.clickTimestamp < 200
        ) {
          this.$refs.field.doubleClick(event)
        }
      } else {
        // If the field is not yet selected we can change the state to selected.
        this.selected = true
        this.$nextTick(() => {
          // Call the select method on the next tick because we want to wait for all
          // changes to have rendered.
          this.$refs.field.select(event)
        })

        // Register a body click event listener so that we can detect if a user has
        // clicked outside the field. If that happens we want to unselect the field and
        // possibly save the value.
        this.$el.clickOutsideEvent = (event) => {
          if (
            // Check if the column is still selected.
            this.selected &&
            // Check if the event has the 'preventFieldCellUnselect' attribute which
            // if true should prevent the field from being unselected.
            !(
              'preventFieldCellUnselect' in event &&
              event.preventFieldCellUnselect
            ) &&
            // If the click was outside the column element.
            !isElement(this.$el, event.target) &&
            // If the child field allows to unselect when clicked outside.
            this.$refs.field.canUnselectByClickingOutside(event)
          ) {
            this.unselect()
          }
        }
        document.body.addEventListener('click', this.$el.clickOutsideEvent)

        // Event that is called when a key is pressed while the field is selected.
        this.$el.keyDownEvent = (event) => {
          // When for example a related modal is open all the key combinations must be
          // ignored because the focus is not in the cell.
          if (!this.$refs.field.canKeyDown(event)) {
            return
          }

          // If the tab or arrow keys are pressed we want to select the next field. This
          // is however out of the scope of this component so we emit the selectNext
          // event that the GridView can handle.
          const { keyCode, ctrlKey, metaKey } = event
          const arrowKeysMapping = {
            37: 'selectPrevious',
            38: 'selectAbove',
            39: 'selectNext',
            40: 'selectBelow',
          }
          if (
            Object.keys(arrowKeysMapping).includes(keyCode.toString()) &&
            this.$refs.field.canSelectNext(event)
          ) {
            event.preventDefault()
            this.$emit(arrowKeysMapping[keyCode])
          }
          if (keyCode === 9 && this.$refs.field.canSelectNext(event)) {
            event.preventDefault()
            this.$emit(event.shiftKey ? 'selectPrevious' : 'selectNext')
          }

          // Copie the value to the clipboard if ctrl/cmd + c is pressed.
          if (
            (ctrlKey || metaKey) &&
            keyCode === 67 &&
            this.$refs.field.canCopy(event)
          ) {
            const rawValue = this.row['field_' + this.field.id]
            const value = this.$registry
              .get('field', this.field.type)
              .prepareValueForCopy(this.field, rawValue)
            copyToClipboard(value)
          }

          // Removes the value if the backspace/delete key is pressed.
          if (
            (keyCode === 46 || keyCode === 8) &&
            this.$refs.field.canEmpty(event)
          ) {
            event.preventDefault()
            const value = this.$registry
              .get('field', this.field.type)
              .getEmptyValue(this.field)
            const oldValue = this.row['field_' + this.field.id]
            if (value !== oldValue) {
              this.update(value, oldValue)
            }
          }
        }
        document.body.addEventListener('keydown', this.$el.keyDownEvent)

        // Updates the value of the field when a user pastes something in the field.
        this.$el.pasteEvent = (event) => {
          if (!this.$refs.field.canPaste(event)) {
            return
          }

          const value = this.$registry
            .get('field', this.field.type)
            .prepareValueForPaste(this.field, event.clipboardData)
          const oldValue = this.row['field_' + this.field.id]
          if (value !== oldValue) {
            this.update(value, oldValue)
          }
        }
        document.addEventListener('paste', this.$el.pasteEvent)

        // Emit the selected event so that the parent component can take an action like
        // making sure that the element fits in the viewport.
        this.$emit('selected', {
          component: this,
          row: this.row,
          field: this.field,
        })
      }

      this.clickTimestamp = timestamp
    },
    unselect() {
      this.$refs.field.beforeUnSelect()
      this.$nextTick(() => {
        this.selected = false
        this.$emit('unselected', {
          row: this.row,
          field: this.field,
        })
      })
      document.body.removeEventListener('click', this.$el.clickOutsideEvent)
      document.body.removeEventListener('keydown', this.$el.keyDownEvent)
      document.removeEventListener('paste', this.$el.pasteEvent)
    },
  },
}
</script>
