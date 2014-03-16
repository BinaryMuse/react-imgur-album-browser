/** @jsx React.DOM */

// Throttle a function so it doesn't fire more than every threshold ms.
function throttle(fn, threshhold, scope) {
  threshhold || (threshhold = 250);
  var last,
      deferTimer;
  return function () {
    var context = scope || this;

    var now = +new Date,
        args = arguments;
    if (last && now < last + threshhold) {
      // hold on to it
      clearTimeout(deferTimer);
      deferTimer = setTimeout(function () {
        last = now;
        fn.apply(context, args);
      }, threshhold);
    } else {
      last = now;
      fn.apply(context, args);
    }
  };
}

// A small wrapper around localStorage to automatically handle serialization
var storage = {
  set: function(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
    return true;
  },

  get: function(key) {
    var item = localStorage.getItem(key);
    if (item) {
      return JSON.parse(item);
    } else {
      return null;
    }
  }
};

// A map of comparator names to functions
var comps = {
  gt:  function(x, y) { return x > y },
  gte: function(x, y) { return x >= y },
  eq:  function(x, y) { return x == y },
  lte: function(x, y) { return x <= y },
  lt:  function(x, y) { return x < y },
};

var ApplicationView = React.createClass({
  render: function() {
    var innerView;

    if (this.state.error) {
      innerView = <div className='error'>Error!</div>;
    } else if (this.state.loading) {
      innerView = <div className='loading'>Loading...</div>;
    } else {
      innerView = [
        <FilterView
          filters={this.state.filters}
          onAddFilter={this.onAddFilter}
          onRemoveFilter={this.onRemoveFilter} />,
        <div className="container-content">
          <WallpaperView
            results={this.state.results} />
          <NavigationView
            pagination={this.state.pagination}
            onChangePage={this.onChangePage} />
        </div>
      ];
    }

    return (
      <div className="container">
        {innerView}
      </div>
    );
  },

  getInitialState: function() {
    var savedFilters = storage.get('walldb-filters');
    var savedPagination = storage.get('walldb-pagination');

    return {
      images: mori.vector(),
      filters: savedFilters ? mori.set(mori.js_to_clj(savedFilters)) : mori.set(),
      results: mori.vector(),
      pagination: savedPagination ? mori.js_to_clj(savedPagination) : mori.hash_map('page', 1, 'per_page', 6),
      error: false,
      loading: true
    };
  },

  componentDidUpdate: function() {
    storage.set('walldb-filters', mori.clj_to_js(this.state.filters));
    storage.set('walldb-pagination', mori.clj_to_js(this.state.pagination));
  },

  componentDidMount: function() {
    superagent.get('album-data.json', function(err, response) {
      if (err) {
        this.setState({error: true});
        return;
      }

      var data = response.body.data;
      var images = mori.js_to_clj(data.images);
      var newPagination = mori.assoc(this.state.pagination, 'per_page', this.calcPerPage());
      var stateUpdate = {
        images: images,
        pagination: newPagination,
        results: this.calculateResults(images, this.state.filters, newPagination),
        error: false,
        loading: false
      };
      this.setState(stateUpdate);
    }.bind(this));

    window.onresize = throttle(function() {
      var oldPerPage = mori.get(this.state.pagination, 'per_page');
      var newPerPage = this.calcPerPage();
      if (oldPerPage == newPerPage) return;

      var oldPage = mori.get(this.state.pagination, 'page');
      var oldOffset = ((oldPage - 1) * oldPerPage);

      var newPage = Math.max(1, Math.floor(oldOffset / newPerPage) + 1);

      var newPagination = mori.assoc(this.state.pagination, 'per_page', newPerPage, 'page', newPage);
      this.setState({
        pagination: newPagination,
        results: this.calculateResults(this.state.images, this.state.filters, newPagination)
      });
    }, 33, this);
  },

  componentWillUnmount: function() {
    window.onresize = function() {};
  },

  calculateResults: function(images, filters, pagination) {
    fns = mori.map(function(filter) {
      var fn = comps[mori.get_in(filter, ['comparator', 'val'])];
      var propStr = mori.get_in(filter, ['property', 'val']);
      var valStr = mori.get(filter, 'value');

      return function(img) {
        var prop = mori.get(img, propStr);
        return fn(prop, parseInt(valStr, 10));
      }
    }, filters);

    images = mori.filter(function(img) {
      return mori.every(function(fn) {
        return fn(img);
      }, fns);
    }, images);

    var page = mori.get(pagination, 'page');
    var perPage = mori.get(pagination, 'per_page');
    var start = (page - 1) * perPage;
    var end = start + perPage;
    return mori.take(perPage, mori.drop(start, images))
  },

  // Calculates how many images can be shown at a time based on the
  // window width/height. Uses some magic numbers.
  calcPerPage: function() {
    var width = window.innerWidth - 350;
    var height = window.innerHeight - 75;

    var perRow = Math.max(1, Math.floor(width / 340));
    var perCol = Math.max(1, Math.floor(height / 380));
    return perRow * perCol;
  },

  onAddFilter: function(filter) {
    var filters = this.state.filters;
    var newFilters = mori.conj(filters, filter);
    var newPagination = mori.assoc(this.state.pagination, 'page', 1);
    this.setState({
      filters: newFilters,
      pagination: newPagination,
      results: this.calculateResults(this.state.images, newFilters, newPagination)
    });
  },

  onRemoveFilter: function(filter) {
    var filters = this.state.filters;
    var newFilters = mori.disj(filters, filter);
    var newPagination = mori.assoc(this.state.pagination, 'page', 1);
    this.setState({
      filters: newFilters,
      pagination: newPagination,
      results: this.calculateResults(this.state.images, newFilters, newPagination)
    });
  },

  onChangePage: function(pageNum) {
    var pagination = this.state.pagination;
    var newPagination = mori.assoc(pagination, 'page', pageNum);
    this.setState({
      pagination: newPagination,
      results: this.calculateResults(this.state.images, this.state.filters, newPagination)
    });
  }
});

var FilterView = React.createClass({
  render: function() {
    return (
      <div className="container-nav">
        <div>
          <h1>Filters</h1>
          {this.transferPropsTo(<FilterForm />)}
          {this.transferPropsTo(<FilterList />)}
        </div>
      </div>
    );
  }
});

var FilterForm = React.createClass({
  form: {
    properties: [
      { name: 'Width', val: 'width', placeholder: 'ex: 2560' },
      { name: 'Height', val: 'height', placeholder: 'ex: 1080' },
      { name: 'Aspect Ratio', val: 'ratio', placeholder: 'ex: 16:9' }
    ],
    comparators: [
      { name: '>', val: 'gt' },
      { name: '>=', val: 'gte' },
      { name: '=', val: 'eq' },
      { name: '<', val: 'lt' },
      { name: '<=', val: 'tte' },
    ]
  },

  render: function() {
    return (
      <form onSubmit={this.onSubmit}>
        <select value={this.state.property} onChange={this.onPropertyChange}>
          {this.form.properties.map(function(prop, i) {
            return <option key={prop.val} value={i}>{prop.name}</option>;
          }.bind(this))}
        </select>
        <select value={this.state.comparator} onChange={this.onComparatorChange}>
          {this.form.comparators.map(function(comp, i) {
            return <option key={comp.val} value={i}>{comp.name}</option>;
          }.bind(this))}
        </select>
        <input type='text' size='10' value={this.state.value}
          onChange={this.onValueChange} placeholder={this.placeholder()} />
        <input type='submit' value='Add' />
      </form>
    )
  },

  getInitialState: function() {
    return {
      property: 0,
      comparator: 2,
      value: ''
    };
  },

  placeholder: function() {
    return this.form.properties[this.state.property].placeholder;
  },

  onSubmit: function(e) {
    e.preventDefault();
    var prop = this.form.properties[this.state.property];
    var comp = this.form.comparators[this.state.comparator];
    var str = prop.name + " " + comp.name + " " + this.state.value;

    var filter = mori.js_to_clj({
      'property': prop,
      'comparator': comp,
      'value': this.state.value,
      'string': str
    });
    this.props.onAddFilter(filter);
    this.setState({value: ''});
  },

  onPropertyChange: function(e) {
    this.setState({property: e.target.value});
  },

  onComparatorChange: function(e) {
    this.setState({comparator: e.target.value});
  },

  onValueChange: function(e) {
    this.setState({value: e.target.value});
  }
});

var FilterList = React.createClass({
  render: function() {
    var lis = mori.clj_to_js(mori.map(function(filter) {
      return (
        <li key={mori.hash(filter)}>
          {mori.get(filter, 'string')}
          <span className='remove' onClick={this.onRemoveFilter.bind(this, filter)} />
        </li>
      );
    }.bind(this), this.props.filters));

    return (
      <ul className='filters'>{lis}</ul>
    );
  },

  shouldComponentUpdate: function(newProps) {
    if (newProps.filters === this.props.filters) {
      return false;
    }
    return true;
  },

  // TODO: Shouldn't create functions in render, but there are very few
  onRemoveFilter: function(filter) {
    this.props.onRemoveFilter(filter)
  }
});

var WallpaperView = React.createClass({
  render: function() {
    var wallpaperItems = mori.clj_to_js(mori.map(function(img) {
      return <WallpaperItem key={mori.hash(img)} image={img} />;
    }, this.props.results));

    return (
      <div>
        {wallpaperItems}
      </div>
    );
  },

  shouldComponentUpdate: function(newProps) {
    if (mori.equals(newProps.results, this.props.results)) {
      return false;
    }
    return true;
  }
});

var WallpaperItem = React.createClass({
  render: function() {
    var image = this.props.image;
    var width = mori.get(image, 'width');
    var height = mori.get(image, 'height');
    var id = mori.get(image, 'id');
    var link = mori.get(image, 'link');
    var parts = link.split('.');
    var ext = parts[parts.length - 1];
    var thumbLink = 'http://i.imgur.com/' + id + 'm.' + ext;

    return (
      <div className='wallpaper-entry'>
        <a href={link} target='_blank'>
          <div className='wallpaper-thumb' style={{backgroundImage: 'url(' + thumbLink + ')'}} />
        </a>
        <div>
          <a href={'http://imgur.com/download/' + id}>download</a>
        </div>
        <div className='resolution'>{width}x{height}</div>
      </div>
    );
  },

  shouldComponentUpdate: function(newProps) {
    if (newProps.image === this.props.image) {
      return false;
    }
    return true;
  }
});

var NavigationView = React.createClass({
  render: function() {
    var page = mori.get(this.props.pagination, 'page');

    return (
      <div className='navigation'>
        <button onClick={this.onBackClick}>Next</button>
        {' '}Page: {page}{' '}
        <button onClick={this.onNextClick}>Next</button>
      </div>
    );
  },

  onBackClick: function(e) {
    var page = mori.get(this.props.pagination, 'page');
    this.props.onChangePage(page - 1);
  },

  onNextClick: function(e) {
    var page = mori.get(this.props.pagination, 'page');
    this.props.onChangePage(page + 1);
  }
});

React.renderComponent(<ApplicationView />, document.getElementById('app'));
