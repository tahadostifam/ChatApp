import Cookies from "js-cookie";

export const state = () => ({
  user_logged_in: false,
  auth: {
    username: null,
    refresh_token: null,
    auth_token: null,
  },
  user_info: null,
});

export const mutations = {
  updateChat(state, data) {
    if (data.chat_id) {
      const chat_index = state.user_info.chats.findIndex(
        ({ chat_id }) => chat_id == data.chat_id
      );
      if (chat_index != null && state.user_info.chats[chat_index]) {
        if (data.full_name && state.user_info.chats[chat_index].full_name) {
          state.user_info.chats[chat_index].full_name = data.full_name;
        }
        if (
          data.profile_photos &&
          state.user_info.chats[chat_index].profile_photos
        ) {
          state.user_info.chats[chat_index].profile_photos =
            data.profile_photos;
          console.log(data.profile_photos);
          state.user_info.chats[chat_index].profile_photo =
            state.user_info.chats[chat_index].profile_photos[0];
          vm.$set(
            vm.$data.active_chat,
            "profile_photo",
            data.profile_photos[0]
          );
        }
      }
    }
  },
  addNewMessage(state, { chat_id, message }) {
    const chat = state.user_info.chats_messages.find(
      ({ _id }) => _id == chat_id
    );
    if (chat) {
      if (chat.messages_list) {
        chat.messages_list.push(message);
      }
    }
  },
  removeMessage(state, { message_id, chat_id }) {
    const chat_index = state.user_info.chats_messages.findIndex(
      ({ _id }) => _id == chat_id
    );
    if (chat_index != null) {
      const message_index = state.user_info.chats_messages[
        chat_index
      ].messages_list.findIndex(
        ({ message_id: _message_id_ }) => _message_id_ == message_id
      );
      if (message_index != null && message_index > -1) {
        state.user_info.chats_messages[chat_index].messages_list.splice(
          message_index,
          1
        );
      } else {
        console.log("message_index not found on removeMessage");
      }
    } else {
      console.log("chat_index not found on removeMessage");
    }
  },
  createNewChat(state, chat) {
    if (state.user_info.chats_messages) {
      state.user_info.chats_messages.push(chat);
    }
  },
  deleteChat(state, chat_id) {
    if (state.user_info.chats_messages) {
      const chat_index = state.user_info.chats_messages.findIndex(
        ({ _id }) => _id == chat_id
      );
      if (chat_index != null) {
        state.user_info.chats_messages.splice(chat_index, 1);
      }
    }
  },
  removeChat(state, chat_id) {
    if (state.chats_list) {
      const chat_index = state.chats_list.findIndex(
        ({ chat_id: _chat_id_ }) => _chat_id_ == chat_id
      );
      state.chats_list.splice(chat_index, 1);
    }
  },
  setRefreshToken(state, token) {
    state.auth.refresh_token = token;
  },
  setAuthToken(state, token) {
    state.auth.auth_token = token;
  },
  setUserData(state, data) {
    state.user_info = data;
  },
  setUserLoggedIn(state, b) {
    state.user_logged_in = b;
  },
  setUsername(state, username) {
    state.auth.username = username;
  },
  setChatsList(state, list) {
    state.chats_list = list;
  },
  addChat(state, chat) {
    if (state.chats_list) {
      state.chats_list.push(chat);
    }
  },
  addProfilePhoto(state, filename) {
    state.user_info.profile_photos.splice(0, 0, {
      filename: filename,
    });
  },
  removeProfilePhoto(state, filename) {
    const pi = state.user_info.profile_photos.findIndex(
      ({ filename: _filename_ }) => _filename_ == filename
    );
    if (pi != null) {
      state.user_info.profile_photos.splice(pi, 1);
    }
  },
  setFullName(state, full_name) {
    state.user_info.full_name = full_name;
  },
  setBio(state, bio) {
    state.user_info.bio = bio;
  },
};

export const actions = {
  Authenticate({ state }) {
    const axios = this.$axios;

    function fetch_user_data(auth_token) {
      return new Promise((resolve, reject) => {
        axios
          .$post("/api/users/auth", {
            username: state.auth.username,
            auth_token: auth_token,
          })
          .then((response) => {
            if (response.message == "success") {
              return resolve(response.data);
            } else reject();
          })
          .catch((error) => {
            reject(error);
          });
      });
    }

    return new Promise((resolve, reject) => {
      fetch_user_data(state.auth.auth_token)
        .then((user) => {
          return resolve(user);
        })
        .catch(() => {
          console.log("getting new auth_token");
          axios
            .$post("/api/users/refresh_token", {
              refresh_token: state.auth.refresh_token,
            })
            .then((response) => {
              if (response.message == "success") {
                // NOTE - we have new token now :)
                Cookies.set("auth_token", response.tokens.auth_token);
                fetch_user_data(response.tokens.auth_token).then(
                  (new_user) => {
                    console.log("auth_token changed");
                    return resolve(new_user);
                  },
                  (error) => {
                    console.log("1: refreshing auth_token failed");
                    return reject();
                  }
                );
              } else {
                console.log("2: refreshing auth_token failed");
                return reject();
              }
            })
            .catch(() => {
              console.log("3: refreshing auth_token failed");
              return reject();
            });
        });
    });
  },
};
