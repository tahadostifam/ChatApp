Vue.use(EmojiPicker)

new Vue({
    el: '#app',
    vuetify: new Vuetify({
        theme: {
            dark: true
        }
    }),
    data(){
        return {
            theme_color: "green accent-4",
            send_message_input: '',
            context_menu_for_messages: {
                show: false,
                x: 0,
                y: 0,
            }
        }
    },
    methods: {
        insert(emoji) {
          this.send_message_input += emoji
        },
        show_contextmenu_of_message(e){
            e.preventDefault()
            this.$set(this.$data.context_menu_for_messages, 'show', false)
            this.$set(this.$data.context_menu_for_messages, 'x', e.clientX)
            this.$set(this.$data.context_menu_for_messages, 'y', e.clientY)
            this.$nextTick(() => {
                this.$set(this.$data.context_menu_for_messages, 'show', true)
            })
        }
    },
})

const avatar_random_colors = [
    ["pink"],
    ["deep-purple", "darken-1"],
    ["red", "darken-4"],
    ["indigo", "darken-1"],
    ["green", "darken-3"],
    ["orange", "darken-4"],
    ["deep-orange", "darken-3"],
    ["blue-grey", "darken-3"],
    ["grey", "darken-2"],
]

window.findOutColorOfDestinyForSolidColorAvatars = () => {
    const els = document.querySelectorAll('.solid_color_avatar');
    els.forEach((item, index) => {
        const random_index = Math.floor(Math.random() * avatar_random_colors.length);
        avatar_random_colors[random_index].forEach((color) => {
            item.classList.add(color);
        });
    });
}

window.lazyImage = (e) => {
    e.classList.add('image__loaded')
}

window.handleSplashScreen = () => {
    const splash = document.querySelector('#full_splash_screen');
    splash.style.opacity = 0;
    setTimeout(() => {
        splash.style.display = "none";
    }, 200);
}

window.onload = () => {
    window.handleSplashScreen();
    window.findOutColorOfDestinyForSolidColorAvatars();
}