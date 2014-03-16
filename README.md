Imgur Album Browser
===================

This is a small [React](http://facebook.github.io/react/) application that allows you to browse the contents of an Imgur album. It supports pagination and filtering the album by image width and height.

The application uses [Mori](http://swannodette.github.io/mori/) for Clojure-style immutable, persistent data structures. Though the performance is fine in this app, it utilizes React's `shouldComponentUpdate` to skip updating components when the data they depend on doesn't change.

Currently the application is hard-coded to use [this Imgur gallery](http://imgur.com/gallery/abaz1).
