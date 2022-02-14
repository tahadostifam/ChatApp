export default {
  methods: {
    validate_username(username) {
      var result;
      result = username.replace(
        /.*[\W](@(?=.{5,64}(?:\s|$))(?![_])(?!.*[_]{2})[a-zA-Z0-9_]+(?<![_.])).*/,
        ""
      );
      return result.trim();
    },
  },
};
