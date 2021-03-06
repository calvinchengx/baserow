let delayTimeout = null

/**
 * Mixin that introduces a delayedUpdate helper method. This method is specifically
 * helpful in combination with an input field that accepts any form of text. When the
 * user stops typing for 400ms it will do the actual update, but only if the validation
 * passes.
 */
export default {
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      copy: null,
    }
  },
  created() {
    this.copy = this.value
  },
  methods: {
    delayedUpdate(value, immediately = false) {
      clearTimeout(delayTimeout)
      this.$v.$touch()

      if (this.$v.copy.$error) {
        return
      }

      if (immediately) {
        this.$emit('input', value)
      } else {
        delayTimeout = setTimeout(() => {
          this.$emit('input', value)
        }, 400)
      }
    },
  },
  validations: {
    copy: {},
  },
}
